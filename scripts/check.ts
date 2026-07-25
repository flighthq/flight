import { spawnSync } from 'node:child_process';

import { getSelectors, resolvePaths, selectPackages } from './select';

// The non-fixing quality sweep. Run bare (`npm run check`) it is the full whole-repo gate — identical to the
// former `&&` chain. Given a selector (`npm run check scene-formats`, or a path/@scoped form) it runs only the
// per-package-meaningful steps, scoped to that package, so an agent can verify its own work without walking
// the whole monorepo. The cross-package invariants (packages / api / support) run only in the full sweep,
// since scoping them per-package is meaningless; run bare `npm run check` once before handoff to cover them.
const selectors = getSelectors();
const scoped = selectors.length > 0;
const paths = resolvePaths(selectors);
const projects = selectPackages(selectors).map((name) => `packages/${name}`);

function run(label: string, command: string, args: readonly string[]): void {
  process.stdout.write(`\n▶ ${label}\n`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`✗ ${label} failed\n`);
    process.exit(result.status ?? 1);
  }
}

if (!scoped) run('packages:check', 'tsx', ['scripts/packages.ts']);

// Whole-repo typecheck is `tsc -b --noEmit`; scoped, we build just the selected projects' dependency cone
// (`tsc -b <project…>`) — `--noEmit` can't combine with building composite dependencies (TS6310), and the
// emitted .d.ts/.tsbuildinfo are gitignored incremental artifacts.
run('typecheck', 'tsc', scoped ? ['-b', ...projects] : ['-b', '--noEmit']);
run('lint', 'oxlint', scoped ? ['--max-warnings=0', ...paths] : ['--max-warnings=0']);
run('format:check', 'oxfmt', scoped ? ['--check', ...paths] : ['--check', '.']);
run('order:check', 'tsx', ['scripts/order.ts', '--check', ...selectors]);
run('exports:check', 'tsx', ['scripts/completeness.ts', ...selectors]);
run('type-home:check', 'tsx', ['scripts/type-home-progress.ts', '--gate', ...selectors]);

if (!scoped) {
  run('api:check', 'tsx', ['scripts/api.ts', '--check']);
  run('support:check', 'tsx', ['scripts/support.ts', '--check']);
}
