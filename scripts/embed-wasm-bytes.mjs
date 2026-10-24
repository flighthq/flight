import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [wasmPath, outputPath, exportName] = process.argv.slice(2);
if (!wasmPath || !outputPath || !exportName) {
  console.error('Usage: node embed-wasm-bytes.mjs <wasm-file> <output-ts> <export-name>');
  process.exit(1);
}

const base64 = readFileSync(wasmPath).toString('base64');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `const base64 = "${base64}";\nconst binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));\nexport const ${exportName}: Uint8Array = binary;\n`,
);
