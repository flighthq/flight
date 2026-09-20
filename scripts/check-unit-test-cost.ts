// Gate entry point for the default unit lane's cost contract. See `unitTestCost.ts` for the rule, and
// for why it is a capability rule rather than a stopwatch.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { checkUnitTestCost, formatUnitTestCostReport, readUnitTestSources } from './unitTestCost';
import { readUnitTestLaneFiles } from './unitTestLane';

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = readUnitTestLaneFiles(root);

  // ★ THE POPULATION FLOOR THIS GATE'S OWN SUBJECT MATTER IS ABOUT. A walk that reached nothing finds no
  // violations, and "no violations" is the sentence a clean tree produces — so without this the gate
  // would report a green contract over an empty scan. Far below the ~1900 files the lane carries,
  // because that number grows with the repository and an exact pin would turn a reach check into a
  // maintenance tax.
  if (files.length < MINIMUM_LANE_FILES) {
    console.log(
      pc.red(
        `FAIL unit-lane scan reached only ${files.length} test files (expected at least ${MINIMUM_LANE_FILES}); the walk did not reach the lane, so this result describes the scan rather than the repository.`,
      ),
    );
    process.exit(1);
  }

  const report = checkUnitTestCost(readUnitTestSources(root, files));
  console.log(formatUnitTestCostReport(report));
  if (report.unexpected.length > 0 || report.stale.length > 0) process.exit(1);
}

// Declared below `main` and above the call, per the file-tail convention. `main` runs from the line that
// follows, so a module constant placed after that call would still be in the temporal dead zone — the
// trap `scripts/size.ts` records, and which this file hit once before the invocation was wrapped.
const MINIMUM_LANE_FILES = 1_000;

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
