import * as ts from "typescript";

import { assertNever } from "./assert-never.mts";
import { parseSource } from "./adapters/source.mts";

/** What `module.exports =` is called when the value's own names can't all be read. */
export const WHOLE_MODULE = "module.exports";

/**
 * Names a CommonJS module writes onto `module.exports` or `exports`, in source
 * order, each name once. A spread or a computed key hides the rest of that
 * object, so the assignment is recorded as the whole module rather than as a
 * partial list. ESM `export` declarations are not read here.
 */
export function extractExports(filePath: string, sourceText: string): string[] {
  const sourceFile = parseSource(filePath, sourceText);
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (name: string): void => {
    if (name === "" || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const target = node.left;
      if (isModuleExports(target)) {
        addWholeModule(node.right, add);
      } else if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
        const object = target.expression;
        if (isModuleExports(object) || (ts.isIdentifier(object) && object.text === "exports")) {
          const name = ts.isPropertyAccessExpression(target)
            ? target.name.text
            : literalText(target.argumentExpression);
          if (name !== null) add(name);
        }
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === "Object.defineProperty"
    ) {
      // Compiled CommonJS writes each export this way. `__esModule` is the
      // compiler's marker, not a name the module exports.
      const object = node.arguments[0];
      const key = node.arguments[1];
      if (
        object !== undefined &&
        (isModuleExports(object) || (ts.isIdentifier(object) && object.text === "exports"))
      ) {
        const name = literalText(key);
        if (name !== null && name !== "__esModule") add(name);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return names;
}

function addWholeModule(value: ts.Expression, add: (name: string) => void): void {
  if (!ts.isObjectLiteralExpression(value)) {
    add(WHOLE_MODULE);
    return;
  }
  const names: string[] = [];
  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) {
      add(WHOLE_MODULE);
      return;
    }
    const name = objectPropertyName(property);
    if (name === null || name === "") {
      add(WHOLE_MODULE);
      return;
    }
    names.push(name);
  }
  for (const name of names) add(name);
}

function objectPropertyName(property: ts.ObjectLiteralElementLike): string | null {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  if (
    ts.isPropertyAssignment(property) ||
    ts.isMethodDeclaration(property) ||
    ts.isGetAccessor(property) ||
    ts.isSetAccessor(property)
  ) {
    return propertyNameText(property.name);
  }
  if (ts.isSpreadAssignment(property)) return null;
  return assertNever(property, "object literal element");
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isBigIntLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name) || ts.isPrivateIdentifier(name)) return null;
  return assertNever(name, "property name");
}

function isModuleExports(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "exports" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "module"
  );
}

function literalText(node: ts.Expression | undefined): string | null {
  if (node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text;
  }
  return null;
}
