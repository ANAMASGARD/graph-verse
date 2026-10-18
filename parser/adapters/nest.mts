import * as ts from "typescript";

import type { AdapterRoute } from "../types.mts";
import type { AdapterAssignment, AdapterFile, FileRole, FrameworkAdapter } from "../adapters.mts";
import { genericAssignment } from "./generic.mts";
import { baseName, importedSpecifiers, lineOf, parseSource } from "./source.mts";

// The pattern is the controller prefix plus the method path, and only when
// both are string literals. A version, a host, or a global prefix lives
// outside those two decorators, so that route is left out.

const NEST_METHODS = new Map<string, string>([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
  ["Options", "OPTIONS"],
  ["Head", "HEAD"],
  ["All", "ALL"],
  ["Search", "SEARCH"],
]);

const ROLE_BY_SUFFIX = new Map<string, string>([
  ["controller", "Controllers"],
  ["service", "Services"],
  ["module", "Modules"],
  ["entity", "Entities"],
]);

function nestRole(filePath: string): string | null {
  const parts = baseName(filePath).split(".");
  if (parts.length < 3) return null;
  return ROLE_BY_SUFFIX.get(parts[parts.length - 2] ?? "") ?? null;
}

function importsNest(source: string, filePath: string): boolean {
  return importedSpecifiers(parseSource(filePath, source)).some((specifier) => specifier.startsWith("@nestjs/"));
}

export function nestApplies(files: readonly AdapterFile[]): boolean {
  return files.some((file) => importsNest(file.source, file.path));
}

interface Binding {
  kind: "name" | "namespace";
  imported: string;
}

function bindingsOf(sourceFile: ts.SourceFile): Map<string, Binding> {
  const bindings = new Map<string, Binding>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier) || specifier.text !== "@nestjs/common") continue;
    const named = statement.importClause.namedBindings;
    if (named === undefined) continue;
    if (ts.isNamespaceImport(named)) {
      bindings.set(named.name.text, { kind: "namespace", imported: "*" });
      continue;
    }
    for (const element of named.elements) {
      bindings.set(element.name.text, {
        kind: "name",
        imported: (element.propertyName ?? element.name).text,
      });
    }
  }
  return bindings;
}

function decoratorImported(expression: ts.Expression, bindings: ReadonlyMap<string, Binding>): string | null {
  const target = ts.isCallExpression(expression) ? expression.expression : expression;
  if (ts.isIdentifier(target)) {
    const binding = bindings.get(target.text);
    if (binding === undefined || binding.kind !== "name") return null;
    return binding.imported;
  }
  if (
    ts.isPropertyAccessExpression(target) &&
    ts.isIdentifier(target.expression) &&
    bindings.get(target.expression.text)?.kind === "namespace"
  ) {
    return target.name.text;
  }
  return null;
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function literalPaths(node: ts.Expression): string[] | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) {
    const paths: string[] = [];
    for (const element of node.elements) {
      if (!ts.isStringLiteral(element) && !ts.isNoSubstitutionTemplateLiteral(element)) return null;
      paths.push(element.text);
    }
    return paths;
  }
  if (!ts.isObjectLiteralExpression(node)) return null;
  let path: string[] | null = null;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) return null;
    const name = propertyName(property.name);
    if (name !== "path") return null;
    path = literalPaths(property.initializer);
    if (path === null) return null;
  }
  return path;
}

function decoratorPaths(decorator: ts.Decorator): string[] | null {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression) || expression.arguments.length === 0) return [""];
  if (expression.arguments.length !== 1) return null;
  const argument = expression.arguments[0];
  if (argument === undefined) return null;
  return literalPaths(argument);
}

function joinPattern(prefix: string, methodPath: string): string {
  const parts = `${prefix}/${methodPath}`
    .split("/")
    .filter((part) => part.length > 0);
  return `/${parts.join("/")}`;
}

function routesInFile(file: AdapterFile): AdapterRoute[] {
  const sourceFile = parseSource(file.path, file.source);
  const bindings = bindingsOf(sourceFile);
  const routes: AdapterRoute[] = [];
  const visit = (node: ts.Node): void => {
    if (!ts.isClassDeclaration(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    const classDecorators = ts.getDecorators(node) ?? [];
    let prefixes: string[] | null = null;
    for (const decorator of classDecorators) {
      if (decoratorImported(decorator.expression, bindings) !== "Controller") continue;
      prefixes = decoratorPaths(decorator);
      break;
    }
    if (prefixes === null) return;
    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      for (const decorator of ts.getDecorators(member) ?? []) {
        const imported = decoratorImported(decorator.expression, bindings);
        const method = imported === null ? undefined : NEST_METHODS.get(imported);
        if (method === undefined) continue;
        const paths = decoratorPaths(decorator);
        if (paths === null) continue;
        for (const prefix of prefixes) {
          for (const methodPath of paths) {
            routes.push({
              method,
              pattern: joinPattern(prefix, methodPath),
              file: file.path,
              line: lineOf(sourceFile, decorator),
            });
          }
        }
      }
    }
  };
  visit(sourceFile);
  return routes;
}

export const nestAdapter: FrameworkAdapter = {
  id: "nestjs",
  applies: nestApplies,
  assign(files): AdapterAssignment {
    const roles: FileRole[] = files.map((file) => {
      const role = nestRole(file.path);
      if (role === null) return genericAssignment(file.path);
      return { path: file.path, role, roleSource: "nestjs" };
    });
    const routes = files.flatMap((file) => routesInFile(file));
    routes.sort(
      (left, right) =>
        left.pattern.localeCompare(right.pattern) ||
        left.method.localeCompare(right.method) ||
        left.file.localeCompare(right.file) ||
        left.line - right.line,
    );
    return { framework: "NestJS", roles, routes };
  },
};
