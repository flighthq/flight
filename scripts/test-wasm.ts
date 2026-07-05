// Runs tests for wasm-backed (`-rs`) packages after `build:wasm` has baked their
// generated bindings. Packages opt into this by defining a `wasm` script, the
// same contract used by `scripts/build-wasm.ts`.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

const targets: string[] = [];
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = join(packagesDir, entry.name, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.scripts?.wasm && manifest.scripts?.test) targets.push(`packages/${entry.name}`);
}

if (targets.length === 0) {
  console.log('[test:wasm] no wasm-backed package tests found.');
  process.exit(0);
}

for (const target of targets) {
  console.log(`[test:wasm] testing ${target}…`);
  const result = spawnSync(`npm run test --workspace=${target}`, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
