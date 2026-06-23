// Builds the wasm-backed (`-rs`) packages — bake + tsc + glue — by running each
// one's own `build` script. They are identified by defining a `wasm` script (the
// bake step), so this discovers them and scales to future `-rs` packages with no
// edits. The standard `npm run build`/`typecheck` deliberately exclude these
// packages (they need the Rust toolchain to bake first), so this is where they
// get baked, compiled, and type-checked.

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
  if (manifest.scripts?.wasm) targets.push(`packages/${entry.name}`);
}

if (targets.length === 0) {
  console.log('[build:wasm] no wasm-backed packages found.');
  process.exit(0);
}

for (const target of targets) {
  console.log(`[build:wasm] building ${target}…`);
  const result = spawnSync(`npm run build --workspace=${target}`, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
