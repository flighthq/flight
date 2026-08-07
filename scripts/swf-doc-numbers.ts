// Verifies that every number quoted in the SWF cell's prose docs still matches what recomputing it
// yields.
//
// WHY THIS EXISTS. A number written into a doc is a CACHED VALUE, and a cache with no invalidation check
// is a copy that drifts while looking authoritative. Derivation buys reproducibility, not currency — the
// generated artifacts in this cell are gated for exactly that reason, and the prose that quotes them was
// not. **A number must live where something recomputes it.**
//
// It is not hypothetical here: `individuation.md` shipped "25 of 30" when the measured value was 23,
// caught by re-reading rather than by any instrument. This is that instrument.
//
// WHAT IT CANNOT VERIFY, PRINTED EVERY RUN RATHER THAN OMITTED. The loss-family counts have no
// independent recomputation — the families are a declared enumeration, so checking the doc against a
// parse of the same doc would be circular and would prove nothing. Those numbers are named below as
// unverified. A checker that silently verified seven of eight and printed OK would be the same defect it
// exists to catch.
//
// Run `npm run capabilities:numbers` (or `:check`, wired into `npm run check`).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CELL = join('agents', 'packages', 'swf');

interface Expectation {
  // The literal text the doc must contain. Built from a recomputed value, never written by hand.
  doc: string;
  label: string;
  text: string;
}

function runScript(path: string): string {
  return execFileSync('npx', ['tsx', path], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 });
}

function capture(output: string, pattern: RegExp, label: string): string {
  const match = pattern.exec(output);
  if (match === null) throw new Error(`could not recompute ${label}: output did not match ${String(pattern)}`);
  return match[1];
}

const individuation = runScript(join('scripts', 'swf-individuation.ts'));
const tagDispatch = runScript(join('scripts', 'swf-tag-dispatch.ts'));
const collisions = runScript(join('scripts', 'swf-default-collision.ts'));
const capabilities = JSON.parse(readFileSync(join(CELL, 'capabilities.json'), 'utf8')) as {
  capabilities: unknown[];
};
const instrumentation = JSON.parse(readFileSync(join(CELL, 'instrumentation.json'), 'utf8')) as {
  capabilities: unknown[];
  scopeAudited: number;
};

const declaredCount = String(capabilities.capabilities.length);
const readingA = capture(individuation, /total under reading A \(discriminated\): (\d+)/, 'reading A total');
const readingB = capture(individuation, /total under reading B \(same dispatch arm\): (\d+)/, 'reading B total');
const checkedTags = capture(tagDispatch, /checked (\d+) of \d+ capabilities/, 'tag-dispatch ceiling');
const collisionTotal = capture(collisions, /^(\d+) candidate default/m, 'collision candidates');
const unresolved = capture(collisions, /of which (\d+) of (\d+) multi-cause/, 'unresolved sentinels');
const sentinelTotal = capture(collisions, /of which \d+ of (\d+) multi-cause/, 'sentinel total');

const expectations: Expectation[] = [
  { doc: 'individuation.md', label: 'committed capability count', text: `count is **${declaredCount}**` },
  { doc: 'individuation.md', label: 'reading A total', text: `| A — discriminated | **${readingA}** |` },
  { doc: 'individuation.md', label: 'reading B total', text: `| B — same dispatch arm | **${readingB}** |` },
  { doc: 'individuation.md', label: 'tag-dispatch ceiling', text: `ceiling is ${checkedTags} of ${declaredCount}` },
  { doc: 'individuation.md', label: 'collision candidates', text: `${collisionTotal} candidates` },
  {
    doc: 'individuation.md',
    label: 'unresolved multi-cause sentinels',
    text: `${unresolved} of ${sentinelTotal} multi-cause sentinels`,
  },
  {
    doc: 'loss-path-audit.md',
    label: 'scope-audited rows',
    text: `${instrumentation.scopeAudited} of ${instrumentation.capabilities.length}`,
  },
];

// Numbers in these docs that nothing can independently recompute. Listed so the check's own coverage is
// visible: an unlisted number that also cannot be verified would pass silently.
const UNVERIFIABLE: readonly string[] = [
  'loss-path-audit.md — the loss-family counts (12 candidates / 11 wired / 1 demonstrated not-a-loss)',
];

const problems: string[] = [];
for (const expectation of expectations) {
  const body = readFileSync(join(CELL, expectation.doc), 'utf8');
  if (!body.includes(expectation.text)) {
    problems.push(`${expectation.doc}: ${expectation.label} — recomputed value expects the text "${expectation.text}"`);
  }
}

if (problems.length > 0) {
  process.stderr.write(`✗ doc numbers are stale against recomputation:\n  ${problems.join('\n  ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`OK ${expectations.length} quoted numbers match recomputation\n`);
  for (const entry of UNVERIFIABLE) process.stdout.write(`  not verifiable by any recomputation: ${entry}\n`);
}
