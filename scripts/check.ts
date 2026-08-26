import { randomUUID } from 'node:crypto';
import { availableParallelism } from 'node:os';

import pc from 'picocolors';

import { createGateRegistry } from './gateRegistry';
import { formatGateFailure, runGates } from './gateRunner';
import {
  explainEmptyCheckSelection,
  getSelectors,
  isCheckSelectionEmpty,
  resolvePaths,
  selectPackages,
} from './select';

// The non-fixing quality sweep. Run bare (`npm run check`) it is the full whole-repo gate. Given a
// selector (`npm run check scene-formats`, or a path/@scoped form) it runs only the
// per-package-meaningful steps, scoped to that package, so an agent can verify its own work without
// walking the whole monorepo. The cross-package invariants (packages / api / support) run only in the
// full sweep, since scoping them per-package is meaningless; run bare `npm run check` once before
// handoff to cover them.
//
// EVERY GATE RUNS, whatever the ones before it did. These gates are independent — a typecheck error
// says nothing about whether mocks are scoped or exports are covered — so stopping at the first
// failure hides the rest. That is not hypothetical: an unrelated typecheck failure in one tree left
// portable, mocks, api and support silently unrun in whole-repo mode, so a violation of any of them
// could land while the gate that existed to catch it never executed. Failures are collected and
// reported together, and the process exits nonzero at the end. A step whose *inputs* depend on an
// earlier step may still short-circuit inside its own script; gates do not gate each other.
const selectors = getSelectors();
const scoped = selectors.length > 0;
const paths = resolvePaths(selectors);
const projects = selectPackages(selectors).map((name) => `packages/${name}`);

// A selector that resolves to nothing is a typo, not an empty repository. Without this the scoped
// gates run over no projects and no paths, every one of them passes vacuously, and the command exits
// zero having examined nothing — while reporting the same "all check gates passed" a real sweep does.
// The test selector already refuses this; a green from a gate that could not see its subject is worse
// than a red, because it is reported onward in good faith.
if (isCheckSelectionEmpty(selectors, projects, paths)) {
  console.error(pc.red(explainEmptyCheckSelection(selectors)));
  process.exit(1);
}

// Registration rejects a repeated stage name — see scripts/gateRegistry.ts for why that guard exists
// and why it lives at registration rather than in a scan of this file.
const { add, gates } = createGateRegistry();

if (!scoped) {
  add('packages:check', 'tsx', ['scripts/packages.ts']);
  add('license-provenance:check', 'tsx', ['scripts/check-license-provenance.ts']);
  add('package-dist-orphans:check', 'tsx', ['scripts/check-package-dist-orphans.ts']);
}

// Whole-repo typecheck includes SDK source plus the separately-configured functional and tooling trees.
// Scoped checks build just the selected projects' dependency cone (`tsc -b <project…>`) — `--noEmit`
// can't combine with building composite dependencies (TS6310), and the emitted .d.ts/.tsbuildinfo are
// gitignored incremental artifacts.
if (scoped) {
  add('typecheck', 'tsc', ['-b', ...projects]);
} else {
  add('typecheck', 'tsx', ['scripts/typecheck.ts']);
}
add('lint', 'oxlint', scoped ? ['--max-warnings=0', ...paths] : ['--max-warnings=0']);
add('format:check', 'oxfmt', scoped ? ['--check', '--threads=4', ...paths] : ['--check', '--threads=4', '.']);
add('order:check', 'tsx', ['scripts/order.ts', '--check', ...selectors]);
add('exports:check', 'tsx', ['scripts/completeness.ts', ...selectors]);
add('reachability:check', 'tsx', ['scripts/reachability.ts', '--check', ...selectors]);
add('type-home:check', 'tsx', ['scripts/type-home-progress.ts', '--gate', ...selectors]);
add('portable:check', 'tsx', ['scripts/portable.ts', '--check', ...selectors]);
add('mocks:check', 'tsx', ['scripts/mocks.ts', '--check']);
add('backend-prefix:check', 'tsx', ['scripts/backendPrefix.ts', '--check']);

if (!scoped) {
  add('api:check', 'tsx', ['scripts/api.ts', '--check']);
  add('api:create-entity:check', 'tsx', ['scripts/create-entity.ts', '--check']);
  add('docs:check', 'tsx', ['scripts/docs.ts', '--check']);
  add('append-only-ledgers:check', 'tsx', ['scripts/check-append-only-ledgers.ts']);
  add('facets:check', 'tsx', ['scripts/requirement-facets.ts', '--check']);
  add('catalog:check', 'tsx', ['scripts/catalog.ts', '--check']);
  add('support:check', 'tsx', ['scripts/support.ts', '--check']);
  add('capabilities:check', 'tsx', ['scripts/swf-capabilities.ts', '--check']);
  add('instrumentation:check', 'tsx', ['scripts/swf-instrumentation.ts', '--check']);
  add('capabilities:sites:check', 'tsx', ['scripts/swf-diagnostic-sites.ts', '--check']);
  add('capabilities:numbers', 'tsx', ['scripts/swf-doc-numbers.ts']);
  add('fingerprint-computation-id:check', 'tsx', ['scripts/check-fingerprint-computation-id.ts']);
  // Lives HERE, in the gate every commit reaches, rather than in a CI job selected by changed paths.
  // Its subject is scripts/capture-baseline-coverage-manifest.json, a COMMITTED file: a commit that
  // deletes a pin from the manifest and touches no code is a .md-free but code-free change, which a
  // path filter routes down the docs lane. That would let coverage be retired through the exact door
  // the manifest exists to close, and the diff would read as ordinary housekeeping while doing it. A
  // gate against silent removal must not itself be silently skippable. It reads committed baselines
  // and scene sources off disk with no browser, no GPU and no capture output — verified by running it
  // with `.artifacts` and the functional dist absent — so always running it costs effectively nothing.
  //
  // ★ ONE REGISTRATION, AND IT ARRIVED TWICE. builder and builder2 each added this identical line
  // independently, five lines apart, from the same base blob. Neither hunk conflicted with the other,
  // so both applied clean and the stage was registered twice — `add` does not reject a duplicate name,
  // and a sweep that runs a stage twice is green either way. NON-OVERLAPPING TEXT IS NOT INDEPENDENT
  // INTENT: proximity, not identity, is what git checks.
  add('evidence:check', 'tsx', ['scripts/capture-evidence.ts', '--check']);
  add('assertions:check', 'node', ['scripts/assertion-sensitivity.mjs', '--check']);

  add('data-cast-colour:check', 'tsx', ['scripts/check-data-cast-colour.ts']);
  add('expected-image-descriptions:check', 'tsx', ['scripts/check-expected-image-descriptions.ts', '--check']);
  add('functional-antialiasing:check', 'tsx', ['scripts/check-functional-antialiasing.ts', '--check']);
  add('degree-constants:check', 'tsx', ['scripts/check-degree-constants.ts']);

  // Advisory, and deliberately not a gate. `fingerprint-source-hashes:check` above proves a baseline
  // column RECORDS a sourceHash; nothing proved that hash still names the current scene bytes, and the
  // instrument that answers it existed unrun. It cannot become a gate: measured 2026-08-19 the functional
  // suite is exact=0 mismatch=408 of 408 columns, so a gate would be red on day one and switched off by
  // Friday. It is also not a defect count — a comment or import reorder moves a scene's hash without
  // moving a pixel, which is why the census prints that warning above its own numbers.
  //
  // Read it as: the 408 are UNVERIFIED, not wrong. A column is only known wrong when someone captures it
  // and the pixels disagree, which is a separate and much stronger claim.
  add('capture provenance (advisory)', 'tsx', ['scripts/capture-provenance-census.ts']);

  // Advisory, and deliberately not a gate: `scripts/size.ts` always exits 0, so this reports which
  // bundles moved against the unminified baseline without ever failing the sweep. A red here would
  // push an agent to rewrite the baseline to clear it, and the shipping pins sit one command away —
  // see agents/bundle-size.md. It carries no `:check` suffix because it checks nothing.
  //
  // Whole-repo only. The sweep measures all 139 cases regardless of selector, so running it under a
  // package selector would cost a minute to answer a question the selector did not ask.
  add('size (advisory)', 'tsx', ['scripts/size.ts']);
}

// Gates are independent and still all run, but a small worker pool overlaps their repeated repository
// walks and native tooling. Output is buffered per gate and replayed in canonical order so concurrency
// never turns diagnostics into an interleaved log. Override the bounded default when profiling a host.
const configuredConcurrency = Number.parseInt(process.env.FLIGHT_CHECK_CONCURRENCY ?? '', 10);
const concurrency = Number.isFinite(configuredConcurrency)
  ? Math.max(1, configuredConcurrency)
  : Math.min(6, Math.max(1, Math.ceil(availableParallelism() / 2)));
const results = await runGates(gates, concurrency, {
  progress: {
    gateLabel: 'reachability:check',
    onRecord: (record) => {
      process.stderr.write(`[reachability:check] probing ${record.packageName}:${record.registrar}\n`);
    },
    token: randomUUID(),
  },
});
const failed: string[] = [];

for (const result of results) {
  process.stdout.write(`\n▶ ${result.label}\n`);
  process.stdout.write(result.output);
  if (!result.passed) {
    process.stdout.write(`${pc.red('✗')} ${result.label} failed (${formatGateFailure(result)})\n`);
    failed.push(result.label);
  }
}

// The summary is the point of running everything: one place that says which gates are red, so a reader
// does not have to scroll a long log or re-run to discover the next failure.
if (failed.length > 0) {
  process.stdout.write(`\n${pc.red('✗')} ${pc.bold(`${failed.length} of the check gates failed:`)}\n`);
  for (const label of failed) process.stdout.write(`  ${pc.red('✗')} ${label}\n`);
  process.exit(1);
}

// `npm run check` reads like "the check", and three agents in one day acted on it covering the tests —
// two cited "check passes" for a change whose only guard was a `scripts/*.test.ts`, and one attributed
// this command's CPU time to "the test suite it runs". That is a name promising more than it delivers,
// not three careless readings, so the correction goes where the reader already is: the pass names the
// specific command to run. The gate count is derived from what actually ran rather than written down, so
// a gate added or scoped away cannot leave this line quietly wrong.
const testCommand = scoped ? `npm run test ${selectors.join(' ')}` : 'npm run test';
process.stdout.write(`\n${pc.green('✓')} ${pc.bold('all check gates passed')}\n`);
process.stdout.write(
  pc.dim(`  ${results.length} gates, 0 tests — run \`${testCommand}\` to cover the packages this checked.\n`),
);
