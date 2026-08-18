import ts from 'typescript';

export function sourceContainsExpectedDescription(source: string): boolean {
  const sourceFile = ts.createSourceFile('scene.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'declareExpectedImageDescription') {
        found = true;
        return;
      }
      if (node.expression.text === 'createFunctionalTarget') {
        const options = node.arguments[0];
        if (options !== undefined && ts.isObjectLiteralExpression(options)) {
          found = options.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              ((ts.isIdentifier(property.name) && property.name.text === 'expectedImageDescription') ||
                (ts.isStringLiteral(property.name) && property.name.text === 'expectedImageDescription')),
          );
          if (found) return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

// A scene can also declare that it deliberately carries no description, with a reason. That is a third
// state, and the reviewer needs the reason rather than a prompt to write what somebody chose not to:
// without this, the UI falls through to "this scene has no expectedImageDescription" and asks for work
// that was explicitly declined. Returns the reason so it can be shown, not a boolean.
export function sourceWithheldExpectedDescription(source: string): string | null {
  const sourceFile = ts.createSourceFile('scene.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let reason: string | null = null;

  const visit = (node: ts.Node): void => {
    if (reason !== null) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'declareExpectedImageDescriptionWithheld'
    ) {
      const argument = node.arguments[0];
      if (argument !== undefined) {
        const text = staticStringOf(argument);
        if (text.length > 0) {
          reason = text;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return reason;
}

// Reasons are written as `'…' + '…'` concatenations for the same line-width reason descriptions are.
function staticStringOf(node: ts.Node): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return staticStringOf(node.left) + staticStringOf(node.right);
  }
  if (ts.isParenthesizedExpression(node)) return staticStringOf(node.expression);
  return '';
}
