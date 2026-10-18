import * as ts from "typescript";

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".mjs")) return ts.ScriptKind.JS;
  if (filePath.endsWith(".cjs")) return ts.ScriptKind.JS;
  if (filePath.endsWith(".js")) return ts.ScriptKind.JS;
  if (filePath.endsWith(".mts") || filePath.endsWith(".cts") || filePath.endsWith(".ts")) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.Unknown;
}

export function parseSource(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind(filePath));
}

export function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function importedSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

export function fileHasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === directive) return true;
  }
  return false;
}

const SOURCE_EXTENSIONS = [".tsx", ".mts", ".cts", ".jsx", ".mjs", ".cjs", ".ts", ".js"] as const;

export function stripSourceExtension(fileName: string): string | null {
  if (fileName.endsWith(".d.ts")) return null;
  for (const extension of SOURCE_EXTENSIONS) {
    if (fileName.endsWith(extension)) return fileName.slice(0, -extension.length);
  }
  return null;
}

export function baseName(filePath: string): string {
  const slash = filePath.lastIndexOf("/");
  return slash === -1 ? filePath : filePath.slice(slash + 1);
}
