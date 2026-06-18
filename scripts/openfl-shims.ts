// The published `openfl` package omits the public `.js` re-export shim for ~26 modules (e.g.
// text/StyleSheet, filters/BevelFilter) — the `.d.ts` ships but the implementation only lives under
// `lib/_gen/openfl/`, so importing those via the `openfl/<module>` specifier fails to resolve at
// runtime. This regenerates the missing shims (matching the package's own convention) for the public
// API surface — every `lib/openfl/<sub>.d.ts` that has no sibling `<sub>.js` but does have a
// generated impl. Idempotent; run from the functional `predev`.

import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

function findOpenflLib(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'node_modules', 'openfl', 'lib');
    if (existsSync(join(candidate, 'openfl')) && existsSync(join(candidate, '_gen', 'openfl'))) return candidate;
    dir = join(dir, '..');
  }
  return null;
}

function walkDeclarations(dir: string, base: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkDeclarations(full, base, out);
    else if (entry.name.endsWith('.d.ts')) out.push(relative(base, full).replace(/\.d\.ts$/, ''));
  }
}

const lib = findOpenflLib();
if (!lib) {
  console.warn('openfl-shims: node_modules/openfl not found; skipping.');
  process.exit(0);
}

const pubRoot = join(lib, 'openfl');
const genRoot = join(lib, '_gen', 'openfl');

const declarations: string[] = [];
walkDeclarations(pubRoot, pubRoot, declarations);

let created = 0;
for (const sub of declarations) {
  if (existsSync(join(pubRoot, `${sub}.js`))) continue; // shim already present
  if (!existsSync(join(genRoot, `${sub}.js`))) continue; // no generated impl to point at (pure type)
  const ups = '../'.repeat(sub.split('/').length);
  writeFileSync(join(pubRoot, `${sub}.js`), `module.exports = require("./${ups}_gen/openfl/${sub}");\n`);
  created++;
}

console.log(`openfl-shims: created ${created} missing re-export shim${created === 1 ? '' : 's'}.`);
