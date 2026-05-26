import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Node, Project } from 'ts-morph';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');

// ── Types ────────────────────────────────────────────────────────────────────

interface SourceFile {
  absPath: string;
  testPath: string;
  rel: string; // relative to root, for display
}

interface FileCoverage {
  file: SourceFile;
  exports: string[];
  missingTestFile: boolean;
  covered: string[];
  uncovered: string[];
}

// ── Discovery ────────────────────────────────────────────────────────────────

function findSourceFiles(): SourceFile[] {
  const results: SourceFile[] = [];

  for (const pkgEntry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkgEntry.isDirectory()) continue;
    const srcDir = join(packagesDir, pkgEntry.name, 'src');
    if (!existsSync(srcDir)) continue;

    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (!name.endsWith('.ts')) continue;
      if (name.endsWith('.test.ts')) continue;
      if (name === 'index.ts' || name === 'internal.ts') continue;

      const absPath = join(srcDir, name);
      results.push({
        absPath,
        testPath: absPath.replace(/\.ts$/, '.test.ts'),
        rel: relative(root, absPath).replaceAll('\\', '/'),
      });
    }
  }

  return results.sort((a, b) => a.rel.localeCompare(b.rel));
}

// ── Export analysis ──────────────────────────────────────────────────────────

function getFunctionExports(project: Project, absPath: string): string[] {
  const sf = project.addSourceFileAtPathIfExists(absPath) ?? project.addSourceFileAtPath(absPath);
  const names: string[] = [];

  for (const [name, decls] of sf.getExportedDeclarations()) {
    const decl = decls[0];
    if (!decl) continue;

    if (Node.isFunctionDeclaration(decl) || Node.isFunctionExpression(decl) || Node.isArrowFunction(decl)) {
      names.push(name);
    } else if (Node.isVariableDeclaration(decl)) {
      const init = decl.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        names.push(name);
      }
    }
  }

  return names.sort();
}

// ── Describe coverage ────────────────────────────────────────────────────────

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

// ── Main ─────────────────────────────────────────────────────────────────────

const project = new Project({
  tsConfigFilePath: join(root, 'tsconfig.base.json'),
  skipAddingFilesFromTsConfig: true,
});

const sourceFiles = findSourceFiles();
const results: FileCoverage[] = [];

for (const file of sourceFiles) {
  const exports = getFunctionExports(project, file.absPath);
  if (exports.length === 0) continue; // types/interfaces/enums only — skip

  if (!existsSync(file.testPath)) {
    results.push({ file, exports, missingTestFile: true, covered: [], uncovered: exports });
    continue;
  }

  const coveredSet = getCoveredFunctions(file.testPath, exports);
  const covered = exports.filter((n) => coveredSet.has(n));
  const uncovered = exports.filter((n) => !coveredSet.has(n));
  results.push({ file, exports, missingTestFile: false, covered, uncovered });
}

const missing = results.filter((r) => r.missingTestFile);
const partial = results.filter((r) => !r.missingTestFile && r.uncovered.length > 0);
const full = results.filter((r) => !r.missingTestFile && r.uncovered.length === 0);
const total = results.length;

// ── Output ───────────────────────────────────────────────────────────────────

if (missing.length > 0) {
  console.log('Missing test files\n');
  for (const r of missing) {
    console.log(`  ${r.file.rel}`);
    console.log(`    ${r.exports.join(', ')}\n`);
  }
}

if (partial.length > 0) {
  console.log('Partial coverage\n');
  for (const r of partial) {
    console.log(`  ${r.file.rel}`);
    if (r.covered.length > 0) console.log(`    covered:   ${r.covered.join(', ')}`);
    console.log(`    uncovered: ${r.uncovered.join(', ')}\n`);
  }
}

console.log('Summary\n');
console.log(`  Functional files: ${total}`);
console.log(`  Fully covered:    ${full.length} (${pct(full.length, total)}%)`);
console.log(`  Partial:          ${partial.length} (${pct(partial.length, total)}%)`);
console.log(`  No tests:         ${missing.length} (${pct(missing.length, total)}%)`);

function pct(n: number, d: number): string {
  return d === 0 ? '0' : Math.round((n / d) * 100).toString();
}
