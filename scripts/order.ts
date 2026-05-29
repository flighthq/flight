import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import * as ts from 'typescript';

interface OrderIssue {
  actual: string[];
  expected: string[];
  label: string;
  path: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');
const checkMode = process.argv.includes('--check');
const verboseMode = process.argv.includes('--verbose');

const issues: OrderIssue[] = [];

for (const path of getPackageSourceFiles()) {
  const sourceFile = ts.createSourceFile(path, readFileSync(path, 'utf-8'), ts.ScriptTarget.Latest, true);

  if (path.endsWith('.test.ts')) {
    const issue = getOrderIssue(path, 'describe blocks should be alphabetized', getDescribeNames(sourceFile));
    if (issue) issues.push(issue);
  } else {
    const issue = getOrderIssue(
      path,
      'exported functions should be alphabetized',
      getExportedFunctionNames(sourceFile),
    );
    if (issue) issues.push(issue);
  }
}

if (issues.length === 0) {
  console.log(`${pc.green('OK')} ${pc.bold('Source and test order valid')}`);
  process.exit(0);
}

const sourceCount = issues.filter((issue) => !issue.path.endsWith('.test.ts')).length;
const testCount = issues.length - sourceCount;
const verboseHint = verboseMode ? '' : pc.dim(' (run npm run order -- --verbose for full lists)');
console.log(
  `${pc.yellow('!')} ${pc.bold(`${issues.length} order issue${issues.length === 1 ? '' : 's'} found`)}${verboseHint}`,
);
console.log(
  `${pc.dim('  source files:')} ${pc.white(sourceCount.toString())} ${pc.dim('test files:')} ${pc.white(testCount.toString())}\n`,
);
for (const issue of issues) printIssue(issue);
process.exit(checkMode ? 1 : 0);

function formatNames(names: string[], color: (value: string) => string): string {
  return names.map((name) => color(name)).join(pc.dim(', '));
}

function getDescribeNames(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) continue;
    const expression = statement.expression;
    if (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'describe'
    ) {
      const [firstArg] = expression.arguments;
      if (firstArg && ts.isStringLiteralLike(firstArg)) names.push(firstArg.text);
    }
  }

  return names;
}

function getExportedFunctionNames(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];

  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const exported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (!exported) continue;

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      names.push(statement.name.text);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const initializer = declaration.initializer;
        if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
          names.push(declaration.name.text);
        }
      }
    }
  }

  return names;
}

function getFirstMismatch(issue: OrderIssue): string {
  const index = issue.actual.findIndex((name, i) => name !== issue.expected[i]);
  if (index === -1) return '';

  const actual = issue.actual[index];
  const expected = issue.expected[index];
  return `${pc.dim('first mismatch:')} ${pc.white(actual)} ${pc.dim('should be')} ${pc.cyan(expected)}`;
}

function getOrderIssue(path: string, label: string, names: string[]): OrderIssue | null {
  if (names.length < 2) return null;

  const expected = [...names].sort((a, b) => a.localeCompare(b));
  const ok = names.every((name, i) => name === expected[i]);
  if (ok) return null;

  return {
    actual: names,
    expected,
    label,
    path: relative(root, path).replaceAll('\\', '/'),
  };
}

function getPackageSourceFiles(): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    files.push(...getSourceFiles(join(packagesDir, entry.name, 'src')));
  }

  return files;
}

function getSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

function printIssue(issue: OrderIssue): void {
  console.log(`  ${pc.yellow('!')} ${pc.white(issue.path)} ${pc.dim(issue.label)}`);
  console.log(`    ${getFirstMismatch(issue)}`);

  if (verboseMode) {
    console.log(`    ${pc.dim('actual:  ')} ${formatNames(issue.actual, pc.white)}`);
    console.log(`    ${pc.dim('expected:')} ${formatNames(issue.expected, pc.cyan)}`);
  }

  console.log('');
}
