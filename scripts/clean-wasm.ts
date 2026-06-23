// Removes the generated, git-ignored wasm-bindgen output (`src/wasm`) from every
// package that has it — the counterpart to `build:wasm`. `clean` and `clean:rust`
// remove the TS and cargo build outputs; this removes the wasm bake. Cleaning is
// uniform across `-rs` packages (just a directory), so unlike `build:wasm` it runs
// from the root and discovers the dirs rather than delegating to per-package scripts.

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

let removed = 0;
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const wasmDir = join(packagesDir, entry.name, 'src', 'wasm');
  if (!existsSync(wasmDir)) continue;
  rmSync(wasmDir, { recursive: true, force: true });
  console.log(`removed ${join('packages', entry.name, 'src', 'wasm')}`);
  removed += 1;
}

console.log(
  removed === 0
    ? '[clean:wasm] no generated wasm output to remove.'
    : `[clean:wasm] removed ${removed} wasm output dir(s).`,
);
