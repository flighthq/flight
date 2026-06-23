// Regenerates src/wasm/surfaceWasmBytes.ts by base64-embedding the wasm-pack
// output (src/wasm/surface_wasm_bg.wasm). Run as the second half of `npm run
// wasm`, after wasm-pack. Embedding keeps init synchronous and free of any file
// read or network fetch, so the shim is a true drop-in across environments.

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const wasmDir = join(here, '..', 'src', 'wasm');

const bytes = readFileSync(join(wasmDir, 'surface_wasm_bg.wasm'));
const base64 = bytes.toString('base64');

// wasm-pack scaffolds the out-dir as if it were its own publishable package,
// dropping a `package.json` and a `.gitignore` (`*`). This dir is generated
// output inside @flighthq/surface-rs, not a package: the stray manifest would
// register as a phantom workspace, and the whole dir is git-ignored anyway.
// Strip both so every bake leaves src/wasm holding only the artifacts.
for (const scaffold of ['package.json', '.gitignore']) {
  rmSync(join(wasmDir, scaffold), { force: true });
}

const module = `// GENERATED — do not edit by hand. Produced by scripts/embed-wasm.ts from
// crates/flighthq-surface-wasm. Holds the wasm module as base64 so init is
// synchronous and needs no file read or network fetch in any environment.

const base64 =
  '${base64}';

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export const surfaceWasmBytes: Uint8Array = decodeBase64(base64);
`;

writeFileSync(join(wasmDir, 'surfaceWasmBytes.ts'), module);
