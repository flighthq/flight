import { parseSync } from 'oxc-parser';
import type { Expression, ModuleExportName, Statement, VariableDeclaration } from 'oxc-parser';

// Export coverage is a syntactic policy: it needs the names of callable values declared in one file,
// not TypeScript's type graph. Keeping that distinction here avoids constructing a compiler project
// and resolving the monorepo once for every source file in the coverage sweep.
export function getFunctionExports(filePath: string, sourceText: string): string[] {
  const { errors, program } = parseSync(filePath, sourceText, { lang: 'ts', sourceType: 'module' });
  if (errors.length > 0) throw new Error(`Could not parse ${filePath}: ${errors[0]?.message ?? 'unknown parse error'}`);

  const localFunctions = collectLocalFunctions(program.body);
  const names = new Set<string>();

  for (const statement of program.body) {
    if (statement.type === 'ExportNamedDeclaration') {
      const declaration = statement.declaration;
      if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'TSDeclareFunction') {
        if (declaration.id !== null) names.add(declaration.id.name);
      } else if (declaration?.type === 'VariableDeclaration') {
        collectVariableFunctions(declaration, names);
      } else if (statement.source === null && statement.exportKind !== 'type') {
        for (const specifier of statement.specifiers) {
          if (specifier.exportKind === 'type') continue;
          const localName = moduleExportName(specifier.local);
          if (localName !== null && localFunctions.has(localName))
            names.add(moduleExportName(specifier.exported) ?? localName);
        }
      }
      continue;
    }

    if (statement.type !== 'ExportDefaultDeclaration') continue;
    const declaration = statement.declaration;
    if (isFunctionValue(declaration)) {
      names.add('default');
    } else if (declaration.type === 'Identifier' && localFunctions.has(declaration.name)) {
      names.add('default');
    }
  }

  return [...names].sort();
}

function collectLocalFunctions(statements: readonly Statement[]): Set<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    if (statement.type === 'FunctionDeclaration' || statement.type === 'TSDeclareFunction') {
      if (statement.id !== null) names.add(statement.id.name);
    } else if (statement.type === 'VariableDeclaration') {
      collectVariableFunctions(statement, names);
    } else if (statement.type === 'ExportNamedDeclaration') {
      const declaration = statement.declaration;
      if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'TSDeclareFunction') {
        if (declaration.id !== null) names.add(declaration.id.name);
      } else if (declaration?.type === 'VariableDeclaration') {
        collectVariableFunctions(declaration, names);
      }
    }
  }
  return names;
}

function collectVariableFunctions(declaration: VariableDeclaration, names: Set<string>): void {
  for (const variable of declaration.declarations) {
    if (variable.id.type === 'Identifier' && variable.init !== null && isFunctionValue(variable.init)) {
      names.add(variable.id.name);
    }
  }
}

function isFunctionValue(expression: Expression | Readonly<{ type: string }>): boolean {
  return (
    expression.type === 'ArrowFunctionExpression' ||
    expression.type === 'FunctionDeclaration' ||
    expression.type === 'FunctionExpression' ||
    expression.type === 'TSDeclareFunction'
  );
}

function moduleExportName(name: ModuleExportName): string | null {
  return name.type === 'Identifier' ? name.name : name.value;
}
