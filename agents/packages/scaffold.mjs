// Idempotent scaffolder for the per-package knowledge tree.
//
//   node agents/packages/scaffold.mjs
//
// For every packages/<name> carrying a package.json, ensures agents/packages/<name>/ exists and writes
// a charter.md + status.md stub if absent. Never overwrites an existing file (existing status docs and
// any authored charter are safe). "What it is" in the charter is seeded from the prior depth review's
// Domain line — words already vetted as accurate — and marked as needing your voice.
//
// review.md / assessment.md are stage OUTPUTS and are intentionally not stubbed here.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
  'host-web',
  'textshaper-canvas',
]);

function domainSeed(name, depthDirectory) {
  const path = join(depthDirectory, `${name}.md`);
  if (!existsSync(path)) return null;
  const line = readFileSync(path, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('**Domain'));
  if (!line) return null;
  return line
    .replace(/\*\*/g, '')
    .replace(/^Domain:?\s*/, '')
    .trim();
}

// The name-driven roles are mechanical, so the scaffold sets them; `header` and `barrel` are one cell
// each and are set by hand. See CONTRACT.md for what each role changes.
function charterRole(name) {
  if (name.startsWith('tool-')) return 'tooling';
  if (name.startsWith('host-')) return 'host';
  return 'package';
}

function charterStub(name, depthDirectory) {
  const crate = NO_CRATE.has(name) ? 'null' : `flighthq-${name}`;
  const seed = domainSeed(name, depthDirectory);
  const whatItIs = seed
    ? `${seed}\n\n_(Seeded from the prior depth review; replace with the intent in your own framing.)_`
    : `_TODO — capture what this package is for, in your framing._`;
  return `---
package: "@flighthq/${name}"
role: ${charterRole(name)}
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

// Both sections are stubbed with their contract stated inline, because the shape is the whole point and
// a bare heading invites back the session narration it replaces. See ../CONTRACT.md.
function statusStub(name) {
  return `---
package: "@flighthq/${name}"
updated: null
by: null
---

# ${name} — Status

> Under 6,000 characters. \`Open\` is rewritten in place; \`Log\` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

_What is unfinished, half-done, or known-wrong in \`@flighthq/${name}\` right now — the dangling threads
and gotchas a reader would otherwise rediscover. Present tense. Rewrite this section rather than
appending to it: a closed thread is deleted, not struck._

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->
`;
}

export function findRealPackageNames(packagesDirectory) {
  return readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(packagesDirectory, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
}

export function scaffoldPackageCells({
  cellsDirectory = here,
  depthDirectory = depthDir,
  packagesDirectory = packagesDir,
} = {}) {
  const packageNames = findRealPackageNames(packagesDirectory);
  let created = 0;
  let skipped = 0;
  for (const name of packageNames) {
    const dir = join(cellsDirectory, name);
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
      writeFileSync(path, make(name, depthDirectory));
      created += 1;
    }
  }

  return { created, packageNames, skipped };
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) {
  const { created, packageNames, skipped } = scaffoldPackageCells();
  console.log(`packages: ${packageNames.length}  files created: ${created}  skipped (existing): ${skipped}`);
}
