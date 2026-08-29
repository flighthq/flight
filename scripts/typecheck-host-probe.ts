import { spawn } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readToolsCoverage } from './typecheck-core';

// ★ CALIBRATION. The coverage guard in `typecheck.test.ts` models both projects by parsing their
// `include`/`exclude` patterns, because it has to pass on a clone with no optional host toolchains — asking
// `tsc` would make the guard itself require Capacitor, Tauri, WDIO and Electron, which is the dependency
// the exclusion exists to remove. That model is a reimplementation of TypeScript's file resolution, and a
// reimplementation drifts: `extends`, project `references`, or a glob shape the matcher does not know would
// all move the real program without moving the model, and the guard would keep reporting the old answer.
//
// So wherever the toolchains ARE installed, this compares the model against what `tsc` actually resolves
// and fails on any difference in either direction. The guard stays runnable everywhere; the claim it makes
// gets checked for real here.
const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');
const toolsDir = join(repoRoot, 'tools');
const listed = await runTsc(['-p', 'tools/host-probe/tsconfig.json', '--listFilesOnly']);

const observed = new Set(
  listed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((file) => relative(toolsDir, file).replace(/\\/g, '/'))
    .filter((file) => file.startsWith('host-probe/') && !file.includes('node_modules/')),
);

// Guard the guard: a `tsc` invocation that failed, or an output shape this parser does not understand,
// yields an empty set that would agree with nothing and be reported as agreement.
if (observed.size === 0) {
  process.stderr.write('✗ tsc --listFilesOnly resolved no host-probe files; the calibration read nothing.\n');
  process.stderr.write(listed);
  process.exit(1);
}

const coverage = readToolsCoverage(repoRoot);
const modelled = new Set(coverage.optIn);
const unmodelled = [...observed].filter((file) => !modelled.has(file)).sort();
const unresolved = [...modelled].filter((file) => !observed.has(file)).sort();

if (unmodelled.length > 0 || unresolved.length > 0) {
  process.stderr.write('✗ the static coverage model disagrees with tsc about the opt-in project.\n');
  if (unmodelled.length > 0) {
    process.stderr.write(`  tsc resolves, the model misses (${unmodelled.length}):\n`);
    for (const file of unmodelled) process.stderr.write(`    ${file}\n`);
  }
  if (unresolved.length > 0) {
    process.stderr.write(`  the model claims, tsc does not resolve (${unresolved.length}):\n`);
    for (const file of unresolved) process.stderr.write(`    ${file}\n`);
  }
  process.stderr.write('  Update the matcher in scripts/typecheck-core.ts — the guard is now reporting a\n');
  process.stderr.write('  program that no longer exists.\n');
  process.exit(1);
}

process.stdout.write(
  `✓ static coverage model matches tsc on all ${observed.size} host-probe files ` +
    `(${coverage.excludedFromOrdinary.length} of them excluded from the ordinary project)\n`,
);

async function runTsc(args: readonly string[]): Promise<string> {
  return await new Promise((settle) => {
    const child = spawn('tsc', [...args], { cwd: repoRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: string[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    child.on('error', (error) => chunks.push(`${error.message}\n`));
    child.on('close', () => settle(chunks.join('')));
  });
}
