// Idempotent scaffolder for the per-package knowledge tree.
//
//   node agents/packages/scaffold.mjs
//
// For every packages/<name>, ensures agents/packages/<name>/ exists and writes a
// charter.md + status.md stub if absent. Never overwrites an existing file (existing status
// docs and any authored charter are safe). "What it is" in the charter is seeded from the prior
// depth review's Domain line — words already vetted as accurate — and marked as needing your voice.
//
// review.md / assessment.md are stage OUTPUTS and are intentionally not stubbed here.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const packagesDir = join(repoRoot, 'packages');
const depthDir = join(repoRoot, 'tools', 'agents', 'docs', 'reviews', 'depth');

// Packages with no Rust crate (browser-API-bound, host adapters, or TS-only). See CONTRACT.md.
const NO_CRATE = new Set([
  'displayobject-canvas',
  'displayobject-dom',
  'effects-canvas',
  'filters-canvas',
  'filters-css',
  'host-electron',
  'textshaper-canvas',
]);

function domainSeed(name) {
  const path = join(depthDir, `${name}.md`);
  if (!existsSync(path)) return null;
  const line = readFileSync(path, 'utf8')
    .split('\n')
    .find((l) => /^\*\*Domain/.test(l));
  if (!line) return null;
  return line
    .replace(/\*\*/g, '')
    .replace(/^Domain:?\s*/, '')
    .trim();
}

function charterStub(name) {
  const crate = NO_CRATE.has(name) ? 'null' : `flighthq-${name}`;
  const seed = domainSeed(name);
  const whatItIs = seed
    ? `${seed}\n\n_(Seeded from the prior depth review; replace with the intent in your own framing.)_`
    : `_TODO — capture what this package is for, in your framing._`;
  return `---
package: "@flighthq/${name}"
crate: ${crate}
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# ${name} — Charter

> Durable vision and core values for \`@flighthq/${name}\`. You author this (via an agent
> transcribing your direction); it is the rubric \`review.md\` and \`assessment.md\` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

${whatItIs}

## North star

_TODO — the durable principles that define "good" for this package; the bar it is held to._

## Boundaries

_TODO — in scope / explicitly NOT in scope (non-goals)._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes. None recorded yet._
`;
}

function statusStub(name) {
  return `---
package: "@flighthq/${name}"
updated: null
by: null
---

# ${name} — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->
`;
}

const names = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let created = 0;
let skipped = 0;
for (const name of names) {
  const dir = join(here, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, make] of [
    ['charter.md', charterStub],
    ['status.md', statusStub],
  ]) {
    const path = join(dir, file);
    if (existsSync(path)) {
      skipped += 1;
      continue;
    }
    writeFileSync(path, make(name));
    created += 1;
  }
}

console.log(`packages: ${names.length}  files created: ${created}  skipped (existing): ${skipped}`);
