// Runs wasm-pack with the forwarded arguments, resolving the binary via
// `resolveWasmPack` so the bake works whether or not cargo's bin dir is on PATH.
// Used by the `-rs` packages' `wasm` script in place of a bare `wasm-pack`
// invocation. Relative path args (e.g. the crate and out-dir) resolve against
// the cwd npm sets to the package dir, exactly as the bare command did.

import { spawnSync } from 'node:child_process';

import { resolveWasmPack } from './resolve-wasm-pack';

const wasmPack = resolveWasmPack();

if (!wasmPack) {
  console.error(
    '\n[wasm] wasm-pack not found on PATH or in cargo’s bin dir.\n' +
      '  Run `npm run install:rust`, or install it directly: `cargo install wasm-pack`.\n',
  );
  process.exit(1);
}

const result = spawnSync(wasmPack, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
