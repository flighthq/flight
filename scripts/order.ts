import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const fixMode = process.argv.includes('--fix');
const verboseMode = process.argv.includes('--verbose');

// ---- fix mode ---------------------------------------------------------------

if (fixMode) {
  let fixedCount = 0;

  for (const path of getPackageSourceFiles()) {
    const sourceText = readFileSync(path, 'utf-8');
    const fixed = getFixedText(path, sourceText);
    if (fixed !== null) {
      writeFileSync(path, fixed, 'utf-8');
      fixedCount++;
      console.log(`${pc.green('✓')} ${pc.white(relative(root, path).replaceAll('\\', '/'))}`);
    }
  }

  if (fixedCount === 0) {
    console.log(`${pc.green('OK')} ${pc.bold('Source and test order valid')}`);
  } else {
    console.log(`\n${pc.green('✓')} ${pc.bold(`Fixed ${fixedCount} file${fixedCount === 1 ? '' : 's'}`)}`);
  }

  process.exit(0);
}

// ---- check / report mode ----------------------------------------------------

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

// ---- fix helpers ------------------------------------------------------------

/**
 * Returns the fixed source text with sortable blocks reordered, or null if
 * the file is already in order (no write needed).
 *
 * Each sortable "block" is the statement itself plus any comment lines that
 * immediately precede it without a blank line in between. Blank lines between
 * blocks are treated as separators and stay in their original positions.
 */
function getFixedText(filePath: string, sourceText: string): string | null {
  const isTest = filePath.endsWith('.test.ts');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const nodes = isTest ? getDescribeStatements(sourceFile) : getExportedFunctionStatements(sourceFile);

  if (nodes.length < 2) return null;

  const names = nodes.map((n) => getStatementSortKey(n, isTest));
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
  if (names.every((n, i) => n === sortedNames[i])) return null;

  // For each sortable statement, compute the start of its "block" — the point
  // after the last blank line before the statement. Comments between that point
  // and the statement are "attached" and move with it.
  const blocks = nodes.map((node) => ({
    start: getBlockStart(sourceText, node),
    end: node.getEnd(),
    name: getStatementSortKey(node, isTest),
  }));

  const sortedBlocks = [...blocks].sort((a, b) => a.name.localeCompare(b.name));

  // Reassemble: walk through blocks in their original positions, substituting
  // each slot's content with the corresponding sorted block's text. The text
  // between consecutive block ends/starts (separators) is preserved unchanged.
  let result = '';
  let pos = 0;

  for (let i = 0; i < blocks.length; i++) {
    result += sourceText.slice(pos, blocks[i].start); // separator / prefix
    result += sourceText.slice(sortedBlocks[i].start, sortedBlocks[i].end); // sorted content
    pos = blocks[i].end;
  }

  result += sourceText.slice(pos); // trailing content after last block
  return result;
}

/**
 * Returns the position in sourceText where the "moveable content" of this
 * node begins — i.e., the start of attached comment lines, or the node's own
 * start if no comments are attached.
 *
 * A comment is "attached" when there is no blank line (empty or
 * whitespace-only line) between it and the node. A blank line breaks the
 * attachment, keeping the comment as part of the preceding separator instead.
 */
function getBlockStart(sourceText: string, node: ts.Node): number {
  const fullStart = node.getFullStart();
  const nodeStart = node.getStart();

  if (fullStart >= nodeStart) return fullStart;

  const trivia = sourceText.slice(fullStart, nodeStart);

  // Split into lines. Exclude the trailing empty string produced by a
  // final newline, since that represents the end of the last comment line
  // rather than a standalone blank line.
  const lines = trivia.split('\n');
  const effectiveEnd = trivia.endsWith('\n') ? lines.length - 1 : lines.length;

  // Find the index of the last blank (empty / whitespace-only) line in the
  // effective range. Everything after it is "attached" to this node.
  let lastBlankIdx = -1;
  for (let i = 0; i < effectiveEnd; i++) {
    if (lines[i].trim() === '') lastBlankIdx = i;
  }

  if (lastBlankIdx === -1) {
    // No blank lines — all trivia is attached to this node.
    return fullStart;
  }

  // Compute the character offset of the line immediately following the last
  // blank line. That is where the attached content begins.
  let offset = 0;
  for (let i = 0; i <= lastBlankIdx; i++) {
    offset += lines[i].length + 1; // +1 for the \n that ended this line
  }
  return fullStart + offset;
}

/** Nodes for top-level describe(...) calls. */
function getDescribeStatements(sourceFile: ts.SourceFile): ts.Statement[] {
  return sourceFile.statements.filter((s) => {
    if (!ts.isExpressionStatement(s)) return false;
    const expr = s.expression;
    return (
      ts.isCallExpression(expr) &&
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === 'describe' &&
      expr.arguments.length > 0 &&
      ts.isStringLiteralLike(expr.arguments[0])
    );
  });
}

/** Nodes for top-level exported function / const-arrow declarations. */
function getExportedFunctionStatements(sourceFile: ts.SourceFile): ts.Statement[] {
  return sourceFile.statements.filter((s) => {
    const modifiers = ts.canHaveModifiers(s) ? ts.getModifiers(s) : undefined;
    if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return false;

    if (ts.isFunctionDeclaration(s) && s.name) return true;

    if (ts.isVariableStatement(s)) {
      return s.declarationList.declarations.some(
        (d) =>
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)),
      );
    }

    return false;
  });
}

/** The sort key for a sortable statement. */
function getStatementSortKey(node: ts.Statement, isTest: boolean): string {
  if (isTest && ts.isExpressionStatement(node)) {
    const expr = node.expression as ts.CallExpression;
    return (expr.arguments[0] as ts.StringLiteralLike).text;
  }

  if (ts.isFunctionDeclaration(node)) return node.name!.text;

  if (ts.isVariableStatement(node)) {
    const decl = node.declarationList.declarations[0];
    return (decl.name as ts.Identifier).text;
  }

  return '';
}

// ---- report helpers ---------------------------------------------------------

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
