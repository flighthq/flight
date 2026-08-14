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
