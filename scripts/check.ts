import { spawnSync } from 'node:child_process';

import pc from 'picocolors';

import { getSelectors, resolvePaths, selectPackages } from './select';

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

const failed: string[] = [];

function run(label: string, command: string, args: readonly string[]): void {
  process.stdout.write(`\n▶ ${label}\n`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`${pc.red('✗')} ${label} failed\n`);
    failed.push(label);
  }
}

if (!scoped) run('packages:check', 'tsx', ['scripts/packages.ts']);

// Whole-repo typecheck includes SDK source plus the separately-configured functional and tooling trees.
// Scoped checks build just the selected projects' dependency cone (`tsc -b <project…>`) — `--noEmit`
// can't combine with building composite dependencies (TS6310), and the emitted .d.ts/.tsbuildinfo are
// gitignored incremental artifacts.
if (scoped) {
  run('typecheck', 'tsc', ['-b', ...projects]);
} else {
  run('typecheck', 'tsx', ['scripts/typecheck.ts']);
}
run('lint', 'oxlint', scoped ? ['--max-warnings=0', ...paths] : ['--max-warnings=0']);
run('format:check', 'oxfmt', scoped ? ['--check', ...paths] : ['--check', '.']);
run('order:check', 'tsx', ['scripts/order.ts', '--check', ...selectors]);
run('exports:check', 'tsx', ['scripts/completeness.ts', ...selectors]);
run('reachability:check', 'tsx', ['scripts/reachability.ts', '--check', ...selectors]);
run('type-home:check', 'tsx', ['scripts/type-home-progress.ts', '--gate', ...selectors]);
run('portable:check', 'tsx', ['scripts/portable.ts', '--check', ...selectors]);
run('mocks:check', 'tsx', ['scripts/mocks.ts', '--check']);
run('backend-prefix:check', 'tsx', ['scripts/backendPrefix.ts', '--check']);

if (!scoped) {
  run('api:check', 'tsx', ['scripts/api.ts', '--check']);
  run('support:check', 'tsx', ['scripts/support.ts', '--check']);
}

// The summary is the point of running everything: one place that says which gates are red, so a reader
// does not have to scroll a long log or re-run to discover the next failure.
if (failed.length > 0) {
  process.stdout.write(`\n${pc.red('✗')} ${pc.bold(`${failed.length} of the check gates failed:`)}\n`);
  for (const label of failed) process.stdout.write(`  ${pc.red('✗')} ${label}\n`);
  process.exit(1);
}

process.stdout.write(`\n${pc.green('✓')} ${pc.bold('all check gates passed')}\n`);
