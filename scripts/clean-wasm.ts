// Removes the generated wasm-bindgen *implementation* (glue, binary, wasm-side
// types, base64 bytes) from every `-rs` package's `src/wasm`, while keeping the
// committed `.d.ts` *contracts* (the firm compile-time link). Counterpart to
// `build:wasm`; `clean` and `clean:rust` remove the TS and cargo outputs.
//
// A contract is a `.d.ts` that is NOT the wasm binary's own `_bg.wasm.d.ts`
// (that one is generated). Everything else in src/wasm is generated and removed.

import { readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

function isCommittedContract(name: string): boolean {
  return name.endsWith('.d.ts') && !name.endsWith('_bg.wasm.d.ts');
}

let removed = 0;
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const wasmDir = join(packagesDir, entry.name, 'src', 'wasm');
  let files: string[];
  try {
    files = readdirSync(wasmDir);
  } catch {
    continue;
  }
  for (const file of files) {
    if (isCommittedContract(file)) continue;
    rmSync(join(wasmDir, file), { recursive: true, force: true });
    removed += 1;
  }
  console.log(`cleaned generated wasm in ${join('packages', entry.name, 'src', 'wasm')}`);
}

console.log(
  removed === 0
    ? '[clean:wasm] no generated wasm output to remove.'
    : `[clean:wasm] removed ${removed} generated file(s), kept committed contracts.`,
);
