// Copies the wasm-bindgen JS glue (and its types) from src/wasm into dist/wasm
// after `tsc -b`. tsc resolves `./wasm/surface_wasm.js` to its sibling .d.ts for
// types but does not emit the .js itself (it is not a TypeScript source), so the
// built dist needs the glue placed alongside the compiled shim. The wasm bytes
// are embedded in surfaceWasmBytes (compiled by tsc), so the raw .wasm is not
// shipped.

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcWasm = join(here, '..', 'src', 'wasm');
const distWasm = join(here, '..', 'dist', 'wasm');

mkdirSync(distWasm, { recursive: true });
for (const file of ['surface_wasm.js', 'surface_wasm.d.ts']) {
  copyFileSync(join(srcWasm, file), join(distWasm, file));
}
