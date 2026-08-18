import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { findDataCastColourViolations } from './data-cast-colour';

// Gate: no cast target in the scanned trees carries a colour-bearing field.
//
// This assertion used to live in `data-cast-colour.test.ts` as a single `it()`. It is a repo-wide
// invariant over five trees, which is unbounded work inside vitest's fixed per-test deadline — a gate
// wearing a test's clothing. It timed out at 5973ms against a 5000ms budget on 2026-08-18 while passing
// in 1840ms in isolation, so the headroom was 2.7x isolated and 1.47x on a healthy full-suite run against
// 2-3x measured host variance. Raising the timeout would have hidden that the margin is being consumed by
// the repo itself: `functional` is one of the scanned trees and the description arc added scene files to
// it all day. Here there is no deadline for growth to eat.
//
// It matters that the deadline came off rather than up. A whole-repo scan under a per-test timeout
// eventually fails for reasons unrelated to what it asserts, and a red that flips green on rerun teaches
// everyone to rerun — which is how a real violation gets dismissed as flake. The move preserves the
// assertion's authority, not just the suite's wall-clock.
//
// The exit is unconditional on purpose: no `--check` flag guards it. Two gates in this repo were found
// the same day whose only `process.exitCode = 1` sat behind a flag their npm script never passed, so they
// were named `check:*` and could not fail. A gate with nothing to forget cannot acquire that defect.

const scriptPath = fileURLToPath(import.meta.url);

function main(): void {
  const root = resolve(dirname(scriptPath), '..');
  const violations = findDataCastColourViolations(root);

  if (violations.length === 0) {
    console.log(pc.green('✓ no cast target carries a colour field'));
    return;
  }

  console.log(pc.red(`${violations.length} cast target(s) carry a colour field:`));
  for (const violation of violations) {
    console.log(`  ${pc.red('✗')} ${violation.file} ${pc.dim('·')} ${violation.typeName}.${violation.field}`);
  }
  process.exitCode = 1;
}

if (resolve(process.argv[1] ?? '') === resolve(join(dirname(scriptPath), 'check-data-cast-colour.ts'))) main();
