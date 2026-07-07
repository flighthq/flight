import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSync } from 'oxc-parser';
import pc from 'picocolors';

interface OrderIssue {
  labels: string[];
  path: string;
}

// One import statement plus its attached leading comments, tagged with its group and original
// position for grouping and stable sorting.
interface ImportBlock {
  group: number;
  index: number;
  source: string;
  text: string;
}

// A parsed top-level statement node from oxc-parser's ESTree output. Only the fields this script
// reads are modeled; every node carries numeric `start`/`end` source offsets.
interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const checkMode = process.argv.includes('--check');
const fixMode = process.argv.includes('--fix');
const jsonMode = process.argv.includes('--json');
const pathFilters = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

// Directory names skipped everywhere during the file walk. Mirrors the oxlint/oxfmt ignore set so
// the two tools agree on what counts as hand-authored source.
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  '.git',
  '.idea',
  '.vscode',
  '.claude',
  '.quimby',
  'worktrees',
  'incoming',
  'docs',
]);

if (fixMode) {
  let fixedCount = 0;

  for (const path of getOrderableFiles()) {
    const sourceText = readFileSync(path, 'utf-8');
    const { text: fixed } = applyConcerns(path, sourceText);
    if (fixed !== sourceText) {
      writeFileSync(path, fixed, 'utf-8');
      fixedCount++;
      console.log(`${pc.green('✓')} ${pc.white(relative(root, path).replaceAll('\\', '/'))}`);
    }
  }

  if (fixedCount === 0) {
    console.log(`${pc.green('OK')} ${pc.bold('Source and import order valid')}`);
  } else {
    console.log(`\n${pc.green('✓')} ${pc.bold(`Fixed ${fixedCount} file${fixedCount === 1 ? '' : 's'}`)}`);
  }

  process.exit(0);
}

const issues: OrderIssue[] = [];

for (const path of getOrderableFiles()) {
  const sourceText = readFileSync(path, 'utf-8');
  const { text: fixed, labels } = applyConcerns(path, sourceText);
  if (fixed !== sourceText) {
    issues.push({ labels, path: relative(root, path).replaceAll('\\', '/') });
  }
}

if (jsonMode) {
  console.log(JSON.stringify({ passed: issues.length === 0, issues }, null, 2));
  process.exit(issues.length > 0 && checkMode ? 1 : 0);
}

if (issues.length === 0) {
  console.log(`${pc.green('OK')} ${pc.bold('Source and import order valid')}`);
  process.exit(0);
}

console.log(`${pc.yellow('!')} ${pc.bold(`${issues.length} order issue${issues.length === 1 ? '' : 's'} found`)}\n`);
for (const issue of issues) {
  console.log(`  ${pc.yellow('!')} ${pc.white(issue.path)} ${pc.dim(issue.labels.join(', '))}`);
}
console.log('');
process.exit(checkMode ? 1 : 0);

// Applies every ordering concern that fits `filePath` in sequence: import sorting runs on all
// orderable files; exported-function and describe-block alphabetization run only on package source.
// Returns the rewritten text plus a label for each concern that changed something.
function applyConcerns(filePath: string, sourceText: string): { labels: string[]; text: string } {
  const labels: string[] = [];
  let text = sourceText;

  const sortedImports = sortImports(filePath, text);
  if (sortedImports !== text) {
    labels.push('imports');
    text = sortedImports;
  }

  if (isPackageSource(filePath)) {
    if (filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')) {
      const sorted = sortStatements(filePath, text, 'describe');
      if (sorted !== text) {
        labels.push('describe blocks');
        text = sorted;
      }
    } else {
      const sorted = sortStatements(filePath, text, 'export');
      if (sorted !== text) {
        labels.push('exported functions');
        text = sorted;
      }
    }
  }

  return { labels, text };
}

// Position where a node's attached leading comments begin: walk the trivia between `fullStart` (the
// end of the previous statement) and `nodeStart`. A blank line breaks the attachment, keeping the
// comment as part of the preceding separator rather than moving it with the node.
function getBlockStart(sourceText: string, fullStart: number, nodeStart: number): number {
  if (fullStart >= nodeStart) return nodeStart;

  const trivia = sourceText.slice(fullStart, nodeStart);
  const lines = trivia.split('\n');
  const effectiveEnd = trivia.endsWith('\n') ? lines.length - 1 : lines.length;

  let lastBlankIdx = -1;
  for (let i = 0; i < effectiveEnd; i++) {
    if (lines[i].trim() === '') lastBlankIdx = i;
  }
  if (lastBlankIdx === -1) return fullStart;

  let offset = 0;
  for (let i = 0; i <= lastBlankIdx; i++) offset += lines[i].length + 1;
  return fullStart + offset;
}

// The import group a source string belongs to, in output order: `node:` builtins, then packages,
// then other absolute specifiers, then relative imports. Matches the codebase's established grouping.
function getImportGroup(source: string): number {
  if (source.startsWith('node:')) return 0;
  if (source.startsWith('.')) return 3;
  if (/^@?\w/.test(source)) return 1;
  return 2;
}

// The alphabetization key for a sortable export or describe statement.
function getStatementSortKey(node: Node): string {
  if (node.type === 'ExpressionStatement') {
    const call = node.expression as Node;
    const args = call.arguments as Node[];
    return (args[0].value as string) ?? '';
  }
  const declaration = node.declaration as Node;
  if (declaration.type === 'FunctionDeclaration') return (declaration.id as Node).name as string;
  const declarator = (declaration.declarations as Node[])[0];
  return (declarator.id as Node).name as string;
}

// Top-level `describe('name', …)` calls.
function isDescribeStatement(node: Node): boolean {
  if (node.type !== 'ExpressionStatement') return false;
  const expr = node.expression as Node;
  if (expr.type !== 'CallExpression') return false;
  const callee = expr.callee as Node;
  const args = expr.arguments as Node[];
  return callee.type === 'Identifier' && callee.name === 'describe' && args.length > 0 && isStringLiteral(args[0]);
}

// Top-level `export function …` or `export const … = () => …` / `= function …` declarations.
function isExportedFunctionStatement(node: Node): boolean {
  if (node.type !== 'ExportNamedDeclaration' || !node.declaration) return false;
  const declaration = node.declaration as Node;
  if (declaration.type === 'FunctionDeclaration' && declaration.id) return true;
  if (declaration.type === 'VariableDeclaration') {
    return (declaration.declarations as Node[]).some((d) => {
      const id = d.id as Node;
      const init = d.init as Node | null;
      return (
        id.type === 'Identifier' &&
        init != null &&
        (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
      );
    });
  }
  return false;
}

function isStringLiteral(node: Node): boolean {
  return node.type === 'Literal' && typeof node.value === 'string';
}

// Reorders the file's import statements into canonical group order. Each maximal run of consecutive
// imports is sorted independently; within a run, imports are grouped (see getImportGroup) and sorted
// by source, with one blank line between groups and none within. Comments attached directly above an
// import (no blank line between) travel with it. Returns the input unchanged if nothing moves or the
// file cannot be parsed cleanly.
function sortImports(filePath: string, sourceText: string): string {
  const body = parseTopLevel(filePath, sourceText);
  if (body === null) return sourceText;

  const runs: Array<[number, number]> = [];
  for (let i = 0; i < body.length; ) {
    if (body[i].type === 'ImportDeclaration') {
      let j = i;
      while (j + 1 < body.length && body[j + 1].type === 'ImportDeclaration') j++;
      runs.push([i, j]);
      i = j + 1;
    } else i++;
  }

  let text = sourceText;
  // Rewrite runs from last to first so earlier source offsets stay valid.
  for (const [a, b] of runs.reverse()) {
    if (b === a) continue;
    const imports = body.slice(a, b + 1);
    const runFullStart = a === 0 ? 0 : body[a - 1].end;
    const runStart = getBlockStart(sourceText, runFullStart, imports[0].start);
    const runEnd = imports[imports.length - 1].end;

    const blocks: ImportBlock[] = imports.map((imp, k) => {
      const raw =
        k === 0
          ? sourceText.slice(runStart, imp.end)
          : stripLeadingBlankLines(sourceText.slice(imports[k - 1].end, imp.end));
      const source = (imp.source as Node).value as string;
      return { group: getImportGroup(source), index: k, source, text: raw };
    });

    const buckets: ImportBlock[][] = [[], [], [], []];
    for (const block of blocks) buckets[block.group].push(block);
    for (const bucket of buckets) bucket.sort((x, y) => x.source.localeCompare(y.source) || x.index - y.index);

    const rebuilt = buckets
      .filter((bucket) => bucket.length > 0)
      .map((bucket) => bucket.map((block) => block.text).join('\n'))
      .join('\n\n');

    if (rebuilt !== sourceText.slice(runStart, runEnd)) {
      text = text.slice(0, runStart) + rebuilt + text.slice(runEnd);
    }
  }
  return text;
}

// Alphabetizes either exported-function statements or top-level describe blocks, preserving the
// separators (blank lines, interleaved non-sortable statements) between them. Each sortable
// statement moves together with the comment lines attached directly above it.
function sortStatements(filePath: string, sourceText: string, kind: 'describe' | 'export'): string {
  const body = parseTopLevel(filePath, sourceText);
  if (body === null) return sourceText;

  const fullStartOf = new Map<Node, number>();
  let prevEnd = 0;
  for (const statement of body) {
    fullStartOf.set(statement, prevEnd);
    prevEnd = statement.end;
  }

  const matches = kind === 'describe' ? isDescribeStatement : isExportedFunctionStatement;
  const nodes = body.filter(matches);
  if (nodes.length < 2) return sourceText;

  const names = nodes.map(getStatementSortKey);
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
  if (names.every((name, i) => name === sortedNames[i])) return sourceText;

  const blocks = nodes.map((node) => ({
    start: getBlockStart(sourceText, fullStartOf.get(node)!, node.start),
    end: node.end,
    name: getStatementSortKey(node),
  }));
  const sortedBlocks = [...blocks].sort((a, b) => a.name.localeCompare(b.name));

  let result = '';
  let pos = 0;
  for (let i = 0; i < blocks.length; i++) {
    result += sourceText.slice(pos, blocks[i].start);
    result += sourceText.slice(sortedBlocks[i].start, sortedBlocks[i].end);
    pos = blocks[i].end;
  }
  result += sourceText.slice(pos);
  return result;
}

function stripLeadingBlankLines(text: string): string {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  return lines.slice(i).join('\n');
}

// Parses a file's top-level statement list with oxc-parser. Returns null when the file has parse
// errors, so the caller leaves an unparseable file untouched rather than risk corrupting it.
function parseTopLevel(filePath: string, sourceText: string): Node[] | null {
  const lang = filePath.endsWith('.tsx') ? 'tsx' : 'ts';
  const { program, errors } = parseSync(filePath, sourceText, { sourceType: 'module', lang });
  if (errors.length > 0) return null;
  return (program.body as unknown as Node[]) ?? null;
}

// True when a path lives under a top-level `packages/<name>/src/` directory — the scope for
// exported-function and describe-block ordering. Anchored at the repo root so the workspace's other
// `packages/` trees (for example `examples/packages/*`) are import-sorted but not export-ordered.
function isPackageSource(path: string): boolean {
  return /^packages\/[^/]+\/src\//.test(relative(root, path).replaceAll('\\', '/'));
}

// Every orderable `.ts`/`.tsx` file: the whole repository minus the ignored directories and the
// generated / reference trees that neither oxlint nor oxfmt touches.
function getOrderableFiles(): string[] {
  const files: string[] = [];
  walk(root, files);
  const filtered = pathFilters.length === 0 ? files : files.filter((f) => matchesFilter(f));
  return filtered.sort();
}

function matchesFilter(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return pathFilters.some((filter) => normalized.includes(filter.replaceAll('\\', '/')));
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const normalized = path.replaceAll('\\', '/');

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      // The agent docs tree is prose + generators, not hand-authored ordered source.
      if (normalized.endsWith('/agents')) continue;
      walk(path, out);
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(path);
    }
  }
}
