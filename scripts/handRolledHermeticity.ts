// Which test files still buy module hermeticity BY HAND, counted at CALL SITES rather than by token.
//
// ★ WHY THIS IS A SCRIPT AND NOT A GREP EVERYONE RETYPES. The obvious form — grep for `resetModules` or
// `doMock` — counts a COMMENT that names those tokens, so a converted file whose comment explains why the
// dance was removed re-adds itself to the count. The better the comment, the worse the measurement, and
// the failure mode is indistinguishable from no progress: a migration can convert every file while its
// own metric sits still. That mistake was made three separate times on 2026-08-13 — twice with a hand-
// written grep and once by a classifier — by people who already knew about it. A rule learned does not
// retrain a reflex; the correct form has to be the one that is available.
//
// TWO MECHANISMS, DELIBERATELY COUNTED APART, because they are not the same defect:
//   `vi.doMock(` — the full dance: mock, then dynamically re-import the subject, rebuilding its whole
//     transitive module graph inside a FIXED hook deadline. This is the one that hook-times-out, and it
//     is the arc's denominator.
//   `vi.resetModules(` alone — vestigial: a dead call in a file whose mocks are already hoisted. Worth
//     removing, but it rebuilds nothing and cannot time out.
//
// ★ THE POPULATION IS THE TIER LIST, ON PURPOSE. DO NOT ENUMERATE FROM DISK.
// This walks `REGISTRY_ISOLATED_TESTS`, so it cannot see a file that hand-rolls hermeticity WITHOUT
// being tiered. That reads like a gap when you find it from inside this script, and it is not one:
// `mocks:check` already polices that boundary from the other side — `scripts/mocks.ts` reports
// `untiered-mock` for any file that mocks modules (`vi.doMock` included) and is absent from the list.
// So this script measures WITHIN the tier and that one guards the EDGE of it, covering both directions
// with no overlap.
// "Fixing" this to scan `packages/*/src/*.test.ts` would give two gates one responsibility — the exact
// defect removed from `scripts/check.ts` on 2026-08-13, where two agents independently registered
// `evidence:check` and both hunks applied clean because they landed five lines apart. A second opinion
// on a question that already has an owner is not extra safety; it is two things to keep in agreement.
// Measured when this note was written: zero files outside the tier do the dance. That is a fact about
// today. The boundary is a fact about the instrument.
//
// Reads only. Prints a list and a count; never fails a build. Same standing as `untested` / `unchecked` /
// `contrast`: an address list to go and read.
import { readFileSync } from 'node:fs';

import { REGISTRY_ISOLATED_TESTS } from './registryIsolatedTests';

export interface HandRolledHermeticityReport {
  readonly dynamicMocking: readonly string[];
  readonly vestigialReset: readonly string[];
}

// Strips `//` comments before matching, and requires a real call site — `vi.doMock(` with optional
// whitespace — so prose ABOUT the pattern never counts as the pattern.
export function findHandRolledHermeticity(files: readonly string[]): HandRolledHermeticityReport {
  const dynamicMocking: string[] = [];
  const vestigialReset: string[] = [];
  for (const file of files) {
    const source = stripLineComments(readFileSync(file, 'utf8'));
    if (/\bvi\s*\.\s*doMock\s*\(/.test(source)) dynamicMocking.push(file);
    else if (/\bvi\s*\.\s*resetModules\s*\(/.test(source)) vestigialReset.push(file);
  }
  return { dynamicMocking, vestigialReset };
}

// Line comments only. A `//` inside a string literal would be stripped too, which cannot produce a false
// NEGATIVE here — a call site is never inside a string in these files — and the alternative is parsing
// TypeScript to count a grep.
export function stripLineComments(source: string): string {
  return source.replace(/\/\/.*$/gm, '');
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=scripts\/)/, ''))) {
  const selected = process.argv.slice(2);
  const files = selected.length > 0 ? selected : REGISTRY_ISOLATED_TESTS.map((entry) => entry.path);
  const report = findHandRolledHermeticity(files);
  for (const file of report.dynamicMocking) console.log(`  dynamic-mocking  ${file}`);
  for (const file of report.vestigialReset) console.log(`  vestigial-reset  ${file}`);
  console.log(
    `${report.dynamicMocking.length} file(s) rebuild their subject's module graph by hand; ` +
      `${report.vestigialReset.length} carry a vestigial resetModules, out of ${files.length} checked.`,
  );
}
