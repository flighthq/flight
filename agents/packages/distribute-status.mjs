// Ingest move: distribute an incoming bundle's worker status reports into the per-package cells, and
// scaffold cells for any new packages the bundle introduced.
//
//   node agents/packages/distribute-status.mjs incoming/builder-67dc46d64
//
// Status is written as-claimed (the worker's self-report), clearly marked unverified — a later review
// pass verifies it against the diff. Charters for NEW packages are stubs flagged for a bless decision.
// Never overwrites an existing charter (authored direction is safe); status.md is (re)written per run.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const bundleArg = process.argv[2];
if (!bundleArg) {
  console.error('usage: node distribute-status.mjs <incoming/bundle-dir>');
  process.exit(1);
}
const bundle = join(repoRoot, bundleArg);
const source = bundleArg.replace(/.*\//, '');
const headPkgs = join(bundle, 'head', 'packages');
const headStatus = join(bundle, 'head', 'tools', 'agents', 'docs', 'status');
const STAMP = '2026-06-24';

const NO_CRATE = new Set([
  'displayobject-canvas',
  'displayobject-dom',
  'effects-canvas',
  'filters-canvas',
  'filters-css',
  'host-electron',
  'textshaper-canvas',
]);

const livePkgs = new Set(
  readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name),
);
const bundlePkgs = readdirSync(headPkgs, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let newCells = 0;
let distributed = 0;
let noReport = 0;
const newPackages = [];

for (const name of bundlePkgs) {
  const dir = join(here, name);
  mkdirSync(dir, { recursive: true });
  const isNew = !livePkgs.has(name);
  if (isNew) newPackages.push(name);

  const charterPath = join(dir, 'charter.md');
  if (!existsSync(charterPath)) {
    newCells += 1;
    writeFileSync(charterPath, charterStub(name, isNew));
  }

  const reportPath = join(headStatus, `${name}.md`);
  if (existsSync(reportPath)) {
    writeFileSync(join(dir, 'status.md'), statusDoc(name, readFileSync(reportPath, 'utf8').trim()));
    distributed += 1;
  } else {
    noReport += 1;
  }
}

console.log(
  `bundle packages: ${bundlePkgs.length}  new cells: ${newCells}  status distributed: ${distributed}  no report: ${noReport}`,
);
if (newPackages.length) {
  console.log(`NEW packages (need bless + Package Map entry + charter): ${newPackages.join(', ')}`);
}

function charterStub(name, isNew) {
  const crate = NO_CRATE.has(name) ? 'null' : `flighthq-${name}`;
  const whatItIs = isNew
    ? `_TODO — **NEW** package from \`${source}\`; no Package Map entry yet. Decide whether it should exist before authoring intent._`
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

## What it is

${whatItIs}

## North star

_TODO — the durable principles that define "good" for this package._

## Boundaries

_TODO — in scope / explicitly NOT in scope (non-goals)._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

## Open directions

_Gestured-at but undecided. None recorded yet._
`;
}

function statusDoc(name, report) {
  return `---
package: "@flighthq/${name}"
updated: ${STAMP}
by: ingest:${source}
---

# ${name} — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are
> **as-claimed** until a review pass verifies them against the diff.

## [${STAMP} · ${source}] — as-claimed, not yet review-verified

${report}
`;
}
