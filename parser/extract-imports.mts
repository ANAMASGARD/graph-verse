import * as ts from "typescript";

import { assertNever } from "./assert-never.mts";
import type { EdgeKind } from "./types.mts";

export interface RawImport {
  kind: EdgeKind;
  /** String value when the specifier is a literal. Null when it is an expression. */
  specifier: string | null;
  display: string;
  line: number;
  typeOnly: boolean;
  literal: boolean;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function displayText(sourceFile: ts.SourceFile, node: ts.Node): string {
  const text = node.getText(sourceFile).replace(/\s+/g, " ");
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function stringLiteral(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function importIsTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return false;
  if (bindings.elements.length === 0) return false;
  return bindings.elements.every((element) => element.isTypeOnly);
}

function exportIsTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return false;
  if (node.exportClause.elements.length === 0) return false;
  return node.exportClause.elements.every((element) => element.isTypeOnly);
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  if (
    filePath.endsWith(".ts") ||
    filePath.endsWith(".mts") ||
    filePath.endsWith(".cts") ||
    filePath.endsWith(".d.ts")
  ) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.Unknown;
}

function pushLiteral(
  imports: RawImport[],
  sourceFile: ts.SourceFile,
  node: ts.Node,
  kind: EdgeKind,
  literal: ts.Node,
  typeOnly: boolean,
): void {
  const value = stringLiteral(literal);
  if (value === null) {
    imports.push({
      kind,
      specifier: null,
      display: displayText(sourceFile, literal),
      line: lineOf(sourceFile, node),
      typeOnly,
      literal: false,
    });
    return;
  }
  imports.push({
    kind,
    specifier: value,
    display: value,
    line: lineOf(sourceFile, node),
    typeOnly,
    literal: true,
  });
}

function importTypeArgument(node: ts.ImportTypeNode): ts.Node | null {
  const argument = node.argument;
  if (ts.isLiteralTypeNode(argument)) return argument.literal;
  return argument;
}

/**
 * `require()` and `import = require()` are intentionally not collected.
 * Phase 9 adds them; counting them now would change the coverage denominator.
 */
export function extractImports(filePath: string, sourceText: string): RawImport[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const imports: RawImport[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      pushLiteral(
        imports,
        sourceFile,
        node,
        "IMPORTS",
        node.moduleSpecifier,
        importIsTypeOnly(node),
      );
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined
    ) {
      pushLiteral(
        imports,
        sourceFile,
        node,
        "RE_EXPORTS",
        node.moduleSpecifier,
        exportIsTypeOnly(node),
      );
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const argument = node.arguments[0];
      if (argument === undefined) {
        imports.push({
          kind: "DYNAMIC_IMPORT",
          specifier: null,
          display: displayText(sourceFile, node),
          line: lineOf(sourceFile, node),
          typeOnly: false,
          literal: false,
        });
      } else {
        pushLiteral(imports, sourceFile, node, "DYNAMIC_IMPORT", argument, false);
      }
    } else if (ts.isImportTypeNode(node)) {
      const argument = importTypeArgument(node);
      if (argument !== null) {
        pushLiteral(imports, sourceFile, node, "IMPORTS", argument, true);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      // require-style import equals stays out until phase 9.
    } else {
      // Other nodes carry no import specifier.
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
}

export function nonLiteralReason(kind: EdgeKind): string {
  switch (kind) {
    case "IMPORTS":
      return "import specifier is not a string literal";
    case "RE_EXPORTS":
      return "re-export specifier is not a string literal";
    case "DYNAMIC_IMPORT":
      return "dynamic import specifier is not a string literal";
    default:
      return assertNever(kind, "edge kind");
  }
}
