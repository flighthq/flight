import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { allPackageNames } from './select.js';
import { parseTestShard, selectTestShardTargets } from './test-shard.js';

// Resolved before the top-level flow below rather than with the other module constants at the bottom:
// the package scan runs at import time and would hit the temporal dead zone.
const packagesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages');

// The per-package test lane (`npm run test:unit`): every package under its OWN vitest config, so node
// packages get the `node` environment and jsdom packages get `jsdom`, and tool-capture's serialized
// browser contracts run. `npm run test --workspace=…` used to drive this directly, but npm runs
// workspace scripts strictly in series, and the work does not shrink: per-package Vitest startup and
// per-file environment construction are the cost, and both are what the lane's fidelity is made of.
// So this script exists to SPLIT the series across CI runners with `--shard=2/4` rather than to
// speed it up.
//
// Folding the 141 configs into one Vitest run via `projects` was tried and measured, and is not the
// answer. Each project gets its own Vite server and therefore its own transform cache, so shared
// dependencies are re-transformed per project exactly as before and the 141 boots merely move inside
// one process and stay serial — ~13.5 minutes before the first test ran. That serial boot is the
// disqualifier rather than the total: being per-project, it is paid IN FULL by every shard, so that
// shape cannot be divided the way this one can.
const shardValue = readOption('--shard');
const shard = shardValue === null ? { index: 1, total: 1 } : parseTestShard(shardValue);
if (shard === null) {
  process.stderr.write(
    `${pc.red('✗')} --shard expects <index>/<total> with 1 <= index <= total; got "${shardValue}"\n`,
  );
  process.exit(1);
}

const targets = allPackageNames()
  .filter(hasTestScript)
  .map((name) => ({ name, testFileCount: countTestFiles(name), environment: readEnvironment(name) }));

const selected = selectTestShardTargets(targets, shard);

// Same doctrine the test configs apply to files: a selection that runs nothing is unconfigured, not
// clean. Silence here would let a mis-sized matrix report green for a shard that tested no package.
if (selected.length === 0) {
  process.stderr.write(
    `${pc.red('✗')} shard ${shard.index}/${shard.total} selected no packages out of ${targets.length}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `${pc.dim(`shard ${shard.index}/${shard.total}`)} ${selected.length} of ${targets.length} packages\n`,
);

// Inspecting the split otherwise means running it, which is the thing that takes minutes. Balance is
// the one property of this script that cannot be read off the source, since it depends on the current
// package set.
if (process.argv.includes('--list')) {
  process.stdout.write(`${selected.join('\n')}\n`);
  process.exit(0);
}

// Every package runs whatever the ones before it did. Stopping at the first failure would hide the
// rest, and a shard that reports one broken package when four are broken costs three more CI rounds
// to discover — the same reason scripts/check.ts collects rather than short-circuits.
const failed: string[] = [];
for (const name of selected) {
  process.stdout.write(`\n▶ ${name}\n`);
  const result = spawnSync('npm', ['run', 'test', `--workspace=packages/${name}`], { stdio: 'inherit' });
  if (result.status !== 0) failed.push(name);
}

if (failed.length > 0) {
  process.stderr.write(`\n${pc.red('✗')} ${failed.length} package(s) failed: ${failed.join(', ')}\n`);
  process.exit(1);
}

process.stdout.write(`\n${pc.green('✓')} ${selected.length} package(s) passed\n`);

function readOption(flag: string): string | null {
  const prefix = `${flag}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match === undefined ? null : match.slice(prefix.length);
}

function hasTestScript(name: string): boolean {
  const manifest = join(packagesDir, name, 'package.json');
  if (!existsSync(manifest)) return false;
  const scripts = (JSON.parse(readFileSync(manifest, 'utf8')) as { scripts?: Record<string, string> }).scripts;
  return scripts?.test !== undefined;
}

// Read rather than imported because these configs are ESM modules that pull in vite plugins, and
// importing 141 of them to learn one string would cost more than the whole split. The package configs
// are uniform enough for a text match; an unreadable or unusual one falls through to the DOM
// environment, which over-weights the package rather than under-weighting it.
function readEnvironment(name: string): string {
  const config = join(packagesDir, name, 'vitest.config.ts');
  if (!existsSync(config)) return 'jsdom';
  return /environment:\s*'node'/.test(readFileSync(config, 'utf8')) ? 'node' : 'jsdom';
}

// Weight input for the split, not a correctness check — an undercount costs balance, never coverage,
// so a package whose tests live somewhere unusual still runs, just possibly on a busier shard.
function countTestFiles(name: string): number {
  const sourceDir = join(packagesDir, name, 'src');
  if (!existsSync(sourceDir)) return 0;
  let count = 0;
  const pending = [sourceDir];
  while (pending.length > 0) {
    const directory = pending.pop() as string;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) pending.push(join(directory, entry.name));
      else if (entry.name.endsWith('.test.ts')) count++;
    }
  }
  return count;
}
