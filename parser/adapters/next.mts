import * as ts from "typescript";

import type { AdapterRoute } from "../types.mts";
import type { AdapterAssignment, AdapterFile, FileRole, FrameworkAdapter } from "../adapters.mts";
import { genericAssignment } from "./generic.mts";
import { layerRole } from "./layers.mts";
import {
  baseName,
  fileHasDirective,
  importedSpecifiers,
  lineOf,
  parseSource,
  stripSourceExtension,
} from "./source.mts";

// A page file is the GET document for its URL. The pattern is the path with
// route groups and parallel slots removed. An intercepting segment does not
// name that URL, so no row is emitted. An API file contributes a row only
// for an HTTP method that file actually exports.

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const HTTP_METHOD_SET = new Set<string>(HTTP_METHODS);

type Surface = "page" | "api" | "layout";

function stemOf(filePath: string): string | null {
  return stripSourceExtension(baseName(filePath));
}

function routerRoot(parts: readonly string[]): { kind: "app" | "pages"; from: number } | null {
  if (parts[0] === "app") return { kind: "app", from: 1 };
  if (parts[0] === "src" && parts[1] === "app") return { kind: "app", from: 2 };
  if (parts[0] === "pages") return { kind: "pages", from: 1 };
  if (parts[0] === "src" && parts[1] === "pages") return { kind: "pages", from: 2 };
  return null;
}

function isRouteGroup(segment: string): boolean {
  return segment.startsWith("(") && segment.endsWith(")") && !segment.slice(1, -1).startsWith(".");
}

function isIntercepting(segment: string): boolean {
  return segment.startsWith("(.") || segment.startsWith("(..)") || segment.startsWith("(...)");
}

function patternFromSegments(segments: readonly string[]): string | null {
  const url: string[] = [];
  for (const segment of segments) {
    if (segment.startsWith("_")) return null;
    if (segment.startsWith("@")) continue;
    if (isRouteGroup(segment)) continue;
    if (isIntercepting(segment)) return null;
    url.push(segment);
  }
  return `/${url.join("/")}`;
}

function routePattern(filePath: string): string | null {
  const parts = filePath.split("/");
  const root = routerRoot(parts);
  if (root === null) return null;
  if (root.kind === "app") return patternFromSegments(parts.slice(root.from, -1));
  const rest = parts.slice(root.from);
  const stem = stripSourceExtension(rest[rest.length - 1] ?? "");
  if (stem === null || stem.startsWith("_")) return null;
  const dirs = rest.slice(0, -1);
  if (dirs.some((segment) => segment.startsWith("_"))) return null;
  return patternFromSegments(stem === "index" ? dirs : [...dirs, stem]);
}

function surfaceOf(filePath: string): Surface | null {
  const parts = filePath.split("/");
  const root = routerRoot(parts);
  const stem = stemOf(filePath);
  if (root === null || stem === null) return null;
  const dirs = parts.slice(root.from, -1);
  if (dirs.some((segment) => segment.startsWith("_")) || stem.startsWith("_")) return null;
  if (root.kind === "app") {
    if (stem === "page") return "page";
    if (stem === "route") return "api";
    if (stem === "layout" || stem === "template") return "layout";
    return null;
  }
  if (dirs[0] === "api") return "api";
  return "page";
}

function isRootFile(filePath: string, stem: string): boolean {
  if (stemOf(filePath) !== stem) return false;
  if (!filePath.includes("/")) return true;
  return filePath.startsWith("src/") && !filePath.slice("src/".length).includes("/");
}

function isActionsPath(filePath: string): boolean {
  const slash = filePath.lastIndexOf("/");
  const dirs = slash === -1 ? [] : filePath.slice(0, slash).split("/");
  if (dirs.includes("actions")) return true;
  if (stemOf(filePath) !== "actions") return false;
  // A file named actions.ts is the colocated server-action module. The same
  // name elsewhere (a context module, for example) is not that convention.
  return dirs[0] === "app" || dirs[0] === "pages" || (dirs[0] === "src" && (dirs[1] === "app" || dirs[1] === "pages"));
}

function isNamedExport(node: ts.FunctionDeclaration | ts.VariableStatement): boolean {
  const modifiers = node.modifiers;
  if (modifiers === undefined) return false;
  let exported = false;
  let isDefault = false;
  for (const modifier of modifiers) {
    if (modifier.kind === ts.SyntaxKind.ExportKeyword) exported = true;
    if (modifier.kind === ts.SyntaxKind.DefaultKeyword) isDefault = true;
  }
  return exported && !isDefault;
}

function exportedHttpMethods(source: string, filePath: string): { method: string; line: number }[] {
  const sourceFile = parseSource(filePath, source);
  const found = new Map<string, number>();
  const add = (name: string, node: ts.Node): void => {
    if (!HTTP_METHOD_SET.has(name) || found.has(name)) return;
    found.set(name, lineOf(sourceFile, node));
  };
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && isNamedExport(statement)) {
      add(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement) && isNamedExport(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) add(declaration.name.text, declaration);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) add(element.name.text, element);
      }
    }
  }
  return HTTP_METHODS.flatMap((method) => {
    const line = found.get(method);
    return line === undefined ? [] : [{ method, line }];
  });
}

function importsFramework(source: string, filePath: string): boolean {
  return importedSpecifiers(parseSource(filePath, source)).some(
    (specifier) => specifier === "next" || specifier.startsWith("next/"),
  );
}

function hasAppConvention(filePath: string): boolean {
  const parts = filePath.split("/");
  const root = routerRoot(parts);
  return root?.kind === "app" && surfaceOf(filePath) !== null;
}

export function nextApplies(files: readonly AdapterFile[]): boolean {
  return files.some(
    (file) => isRootFile(file.path, "next.config") || hasAppConvention(file.path) || importsFramework(file.source, file.path),
  );
}

function roleOf(file: AdapterFile): FileRole {
  if (isRootFile(file.path, "next.config")) return { path: file.path, role: "Config", roleSource: "nextjs" };
  if (isRootFile(file.path, "middleware")) return { path: file.path, role: "Middleware", roleSource: "nextjs" };
  const surface = surfaceOf(file.path);
  if (surface === "page") return { path: file.path, role: "Page routes", roleSource: "nextjs" };
  if (surface === "api") return { path: file.path, role: "API endpoints", roleSource: "nextjs" };
  if (surface === "layout") return { path: file.path, role: "Layouts", roleSource: "nextjs" };
  if (isActionsPath(file.path) || fileHasDirective(parseSource(file.path, file.source), "use server")) {
    return { path: file.path, role: "Server actions", roleSource: "nextjs" };
  }
  const layer = layerRole(file.path);
  if (layer !== null) return { path: file.path, role: layer, roleSource: "nextjs" };
  return genericAssignment(file.path);
}

function routesOf(file: AdapterFile, role: string): AdapterRoute[] {
  if (role !== "Page routes" && role !== "API endpoints") return [];
  const pattern = routePattern(file.path);
  if (pattern === null) return [];
  if (role === "Page routes") return [{ method: "GET", pattern, file: file.path, line: 1 }];
  return exportedHttpMethods(file.source, file.path).map((entry) => ({
    method: entry.method,
    pattern,
    file: file.path,
    line: entry.line,
  }));
}

export const nextAdapter: FrameworkAdapter = {
  id: "nextjs",
  applies: nextApplies,
  assign(files): AdapterAssignment {
    const roles = files.map((file) => roleOf(file));
    const byPath = new Map(roles.map((role) => [role.path, role.role]));
    const routes = files.flatMap((file) => routesOf(file, byPath.get(file.path) ?? ""));
    routes.sort(
      (left, right) =>
        left.pattern.localeCompare(right.pattern) ||
        left.method.localeCompare(right.method) ||
        left.file.localeCompare(right.file) ||
        left.line - right.line,
    );
    return { framework: "Next.js", roles, routes };
  },
};
