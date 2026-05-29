import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import { Node, Project } from 'ts-morph';

interface FileCoverage {
  covered: string[];
  exports: string[];
  file: SourceFile;
  missingTestFile: boolean;
  uncovered: string[];
}

interface SourceFile {
  absPath: string;
  rel: string;
  testPath: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');
const verboseMode = process.argv.includes('--verbose');
const maxDefaultNames = 8;

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  tsConfigFilePath: join(root, 'tsconfig.base.json'),
});

const sourceFiles = findSourceFiles();
const results: FileCoverage[] = [];

for (const file of sourceFiles) {
  const exports = getFunctionExports(project, file.absPath);
  if (exports.length === 0) continue;

  if (!existsSync(file.testPath)) {
    results.push({ covered: [], exports, file, missingTestFile: true, uncovered: exports });
    continue;
  }

  const coveredSet = getCoveredFunctions(file.testPath, exports);
  const covered = exports.filter((name) => coveredSet.has(name));
  const uncovered = exports.filter((name) => !coveredSet.has(name));
  results.push({ covered, exports, file, missingTestFile: false, uncovered });
}

const missing = results.filter((result) => result.missingTestFile);
const partial = results.filter((result) => !result.missingTestFile && result.uncovered.length > 0);
const full = results.filter((result) => !result.missingTestFile && result.uncovered.length === 0);
const total = results.length;

if (missing.length > 0) {
  printHeading('Missing test files', missing.length, pc.red);
  for (const result of missing) {
    console.log(`  ${pc.red('x')} ${pc.white(result.file.rel)}`);
    console.log(`    ${pc.dim('exports:')} ${formatNames(result.exports, pc.cyan)}\n`);
  }
}

if (partial.length > 0) {
  printHeading('Partial coverage', partial.length, pc.yellow);
  for (const result of partial) {
    const count = `${result.covered.length}/${result.exports.length}`;
    console.log(`  ${pc.yellow('!')} ${pc.white(result.file.rel)} ${pc.dim(`(${count})`)}`);
    console.log(`    ${pc.dim('uncovered:')} ${formatNames(result.uncovered, pc.yellow)}\n`);
  }
}

printHeading('Summary');
console.log(`  ${pc.dim('Functional files:')} ${pc.bold(total.toString())}`);
console.log(
  `  ${pc.dim('Fully covered:   ')} ${pc.green(full.length.toString())} ${pc.dim(`(${pct(full.length, total)}%)`)}`,
);
console.log(
  `  ${pc.dim('Partial:         ')} ${pc.yellow(partial.length.toString())} ${pc.dim(`(${pct(partial.length, total)}%)`)}`,
);
console.log(
  `  ${pc.dim('No tests:        ')} ${pc.red(missing.length.toString())} ${pc.dim(`(${pct(missing.length, total)}%)`)}`,
);

function findSourceFiles(): SourceFile[] {
  const results: SourceFile[] = [];

  for (const packageEntry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!packageEntry.isDirectory()) continue;
    const srcDir = join(packagesDir, packageEntry.name, 'src');
    if (!existsSync(srcDir)) continue;

    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (!name.endsWith('.ts')) continue;
      if (name.endsWith('.test.ts')) continue;
      if (name === 'index.ts' || name === 'internal.ts') continue;
      if (name.endsWith('TestHelper.ts')) continue;

      const absPath = join(srcDir, name);
      results.push({
        absPath,
        rel: relative(root, absPath).replaceAll('\\', '/'),
        testPath: absPath.replace(/\.ts$/, '.test.ts'),
      });
    }
  }

  return results.sort((a, b) => a.rel.localeCompare(b.rel));
}

function formatNames(names: string[], color: (value: string) => string): string {
  const shown = verboseMode ? names : names.slice(0, maxDefaultNames);
  const suffix =
    shown.length === names.length
      ? ''
      : `${pc.dim(', ')}${pc.dim(`+${names.length - shown.length} more`)} ${pc.dim('(run npm run coverage -- --verbose)')}`;
  return `${shown.map((name) => color(name)).join(pc.dim(', '))}${suffix}`;
}

function getCoveredFunctions(testPath: string, fnNames: string[]): Set<string> {
  const content = readFileSync(testPath, 'utf-8');
  const covered = new Set<string>();
  for (const name of fnNames) {
    if (new RegExp(`describe\\(['"\`]${name}['"\`]`).test(content)) {
      covered.add(name);
    }
  }
  return covered;
}

function getFunctionExports(project: Project, absPath: string): string[] {
  const sourceFile = project.addSourceFileAtPathIfExists(absPath) ?? project.addSourceFileAtPath(absPath);
  const names: string[] = [];

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    const declaration = declarations[0];
    if (!declaration) continue;

    if (
      Node.isFunctionDeclaration(declaration) ||
      Node.isFunctionExpression(declaration) ||
      Node.isArrowFunction(declaration)
    ) {
      names.push(name);
    } else if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer();
      if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
        names.push(name);
      }
    }
  }

  return names.sort();
}

function pct(n: number, d: number): string {
  return d === 0 ? '0' : Math.round((n / d) * 100).toString();
}

function printHeading(label: string, count?: number, color: (value: string) => string = pc.white): void {
  const suffix = count === undefined ? '' : pc.dim(` (${count})`);
  console.log(`${pc.bold(color(label))}${suffix}\n`);
}
