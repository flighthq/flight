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
