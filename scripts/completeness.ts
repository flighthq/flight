import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { getFunctionExports } from './completeness-core';
import { getSelectors, selectPackages } from './select';

// Gate: every exported function has a colocated describe block named after it.
//
// ★ THE PREDICATE IS A DESCRIBE NAME, AND THE OUTPUT MUST NOT CLAIM MORE THAN THAT. An export counts here
// when `getCoveredFunctions` finds `describe('<name>'` in the colocated test file — nothing checks that
// the function is imported, called, or asserted on. Four EMPTY `describe('<name>', () => {})` blocks
// satisfy it, which was demonstrated, not theorised.
//
// This file used to end by printing "every exported function has a colocated test" and a "Fully covered"
// percentage. Both were read as coverage evidence and quoted as coverage evidence, including in
// attestations. The measurement was never wrong; the SENTENCE was, and a sentence travels further than a
// predicate. Every string below therefore says "named" or "describe", never "covered" or "tested".
//
// Depth is a different instrument and the repo already owns it: `npm run untested` lists the arms no test
// took, `npm run unchecked` mutates tokens to find the ones no assertion catches. Do not teach this gate
// to half-measure depth — it would blur two clean tools into one vague one and still prove no assertion.

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
const jsonMode = process.argv.includes('--json');
const maxDefaultNames = 8;

const sourceFiles = findSourceFiles();
const results: FileCoverage[] = [];

for (const file of sourceFiles) {
  const exports = getFunctionExports(file.absPath, readFileSync(file.absPath, 'utf-8'));
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
const passed = missing.length === 0 && partial.length === 0;

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        passed,
        summary: { total, full: full.length, partial: partial.length, missing: missing.length },
        missing: missing.map((r) => ({ file: r.file.rel, exports: r.exports })),
        partial: partial.map((r) => ({
          file: r.file.rel,
          covered: r.covered,
          uncovered: r.uncovered,
          total: r.exports.length,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(passed ? 0 : 1);
}

if (missing.length > 0) {
  printHeading('Missing test files', missing.length, pc.red);
  for (const result of missing) {
    console.log(`  ${pc.red('x')} ${pc.white(result.file.rel)}`);
    console.log(`    ${pc.dim('exports:')} ${formatNames(result.exports, pc.cyan)}\n`);
  }
}

if (partial.length > 0) {
  printHeading('Exports with no matching describe', partial.length, pc.yellow);
  for (const result of partial) {
    const count = `${result.covered.length}/${result.exports.length}`;
    console.log(`  ${pc.yellow('!')} ${pc.white(result.file.rel)} ${pc.dim(`(${count})`)}`);
    console.log(`    ${pc.dim('unnamed:')} ${formatNames(result.uncovered, pc.yellow)}\n`);
  }
}

printHeading('Summary');
console.log(`  ${pc.dim('Functional files:')} ${pc.bold(total.toString())}`);
console.log(
  `  ${pc.dim('All exports named:')} ${pc.green(full.length.toString())} ${pc.dim(`(${pct(full.length, total)}%)`)}`,
);
console.log(
  `  ${pc.dim('Some unnamed:    ')} ${pc.yellow(partial.length.toString())} ${pc.dim(`(${pct(partial.length, total)}%)`)}`,
);
console.log(
  `  ${pc.dim('No test file:    ')} ${pc.red(missing.length.toString())} ${pc.dim(`(${pct(missing.length, total)}%)`)}`,
);

console.log('');
if (passed) {
  console.log(pc.green(`✓ every exported function has a colocated describe block named after it (${total} files)`));
  console.log(
    pc.dim('  Names only — whether those blocks assert anything is `npm run untested` / `npm run unchecked`.'),
  );
  process.exit(0);
} else {
  const gapCount = missing.length + partial.length;
  console.log(pc.red(`✗ ${gapCount} file${gapCount === 1 ? '' : 's'} missing a test file or a matching describe name`));
  process.exit(1);
}

function collectSourceFiles(srcDir: string, dir: string, out: SourceFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip generated, git-ignored wasm-bindgen output (the `src/wasm` dir of
      // the -rs packages); it is not hand-authored source, mirroring the oxlint
      // ignore `**/src/wasm/**`.
      if (entry.name === 'wasm' && dir === srcDir) continue;
      collectSourceFiles(srcDir, absPath, out);
      continue;
    }

    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!name.endsWith('.ts') || name.endsWith('.test.ts') || name.endsWith('.d.ts')) continue;
    if (name === 'index.ts' || name === 'contract.ts' || name === 'internal.ts') continue;
    if (name.toLowerCase().endsWith('testhelper.ts')) continue;

    out.push({
      absPath,
      rel: relative(root, absPath).replaceAll('\\', '/'),
      testPath: absPath.replace(/\.ts$/, '.test.ts'),
    });
  }
}

function findSourceFiles(): SourceFile[] {
  const results: SourceFile[] = [];
  const selected = new Set(selectPackages(getSelectors()));

  for (const packageEntry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!packageEntry.isDirectory() || !selected.has(packageEntry.name)) continue;
    const srcDir = join(packagesDir, packageEntry.name, 'src');
    if (!existsSync(srcDir)) continue;
    collectSourceFiles(srcDir, srcDir, results);
  }

  return results.sort((a, b) => a.rel.localeCompare(b.rel));
}

function formatNames(names: string[], color: (value: string) => string): string {
  const shown = verboseMode ? names : names.slice(0, maxDefaultNames);
  const suffix =
    shown.length === names.length
      ? ''
      : `${pc.dim(', ')}${pc.dim(`+${names.length - shown.length} more`)} ${pc.dim('(run npm run exports:check -- --verbose)')}`;
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

// Floor, not round: a shortfall must never display as 100. 1387 of 1388 rounds to "100%" while the gate
// is failing on the 1388th, which is the same overclaim this file's wording was corrected for.
function pct(n: number, d: number): string {
  return d === 0 ? '0' : Math.floor((n / d) * 100).toString();
}

function printHeading(label: string, count?: number, color: (value: string) => string = pc.white): void {
  const suffix = count === undefined ? '' : pc.dim(` (${count})`);
  console.log(`${pc.bold(color(label))}${suffix}\n`);
}
