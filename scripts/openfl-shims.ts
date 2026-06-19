// The published `openfl` package omits the public `.js` re-export shim for ~26 modules (e.g.
// text/StyleSheet, filters/BevelFilter) — the `.d.ts` ships but the implementation only lives under
// `lib/_gen/openfl/`, so importing those via the `openfl/<module>` specifier fails to resolve at
// runtime. This regenerates the missing shims (matching the package's own convention) for the public
// API surface — every `lib/openfl/<sub>.d.ts` that has no sibling `<sub>.js` but does have a
// generated impl. Idempotent; run from the functional `predev` and `prebuild`.
//
// `sub` is always a POSIX (forward-slash) module path, never an OS-native one. The emitted require
// specifier must use forward slashes so bundlers resolve it on every platform, and the `../` depth is
// derived from `sub.split('/')` — a Windows-native `relative()` result (backslashes) would both embed
// a broken specifier and miscount the depth. Existing shims this script wrote are rewritten rather
// than skipped, so a shim left malformed by an earlier run (e.g. a Windows backslash path) self-heals.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, sep } from 'path';

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
    else if (entry.name.endsWith('.d.ts'))
      out.push(
        relative(base, full)
          .replace(/\.d\.ts$/, '')
          .split(sep)
          .join('/'),
      );
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

const SHIM_PREFIX = 'module.exports = require("';

let written = 0;
for (const sub of declarations) {
  const jsPath = join(pubRoot, `${sub}.js`);
  if (!existsSync(join(genRoot, `${sub}.js`))) continue; // no generated impl to point at (pure type)
  // `sub` carries forward slashes, so the require specifier resolves cross-platform and the depth is
  // counted correctly. The `./` prefix plus N `../` walks up from `lib/openfl/<sub>/` to `lib/`.
  const ups = '../'.repeat(sub.split('/').length);
  const content = `module.exports = require("./${ups}_gen/openfl/${sub}");\n`;
  if (existsSync(jsPath)) {
    const current = readFileSync(jsPath, 'utf8');
    if (!current.startsWith(SHIM_PREFIX)) continue; // a real shipped module — never overwrite it
    if (current === content) continue; // our shim, already correct
    // our shim but malformed (e.g. a Windows backslash path from an earlier run) — rewrite to heal it
  }
  writeFileSync(jsPath, content);
  written++;
}

console.log(`openfl-shims: wrote ${written} re-export shim${written === 1 ? '' : 's'}.`);
