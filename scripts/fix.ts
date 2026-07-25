import { spawnSync } from 'node:child_process';

import { getSelectors, resolvePaths } from './select';

// The auto-fixer sweep: order, then lint, then format. Run bare (`npm run fix`) it rewrites the whole tree —
// identical to the former `&&` chain. Given a selector (`npm run fix scene-formats`, or a path/@scoped form)
// it fixes only that package/those files, so an iterating agent writes just what it touched instead of
// reformatting the whole monorepo. Order matches the previous chain: order:fix → lint:fix → format.
const selectors = getSelectors();
const scoped = selectors.length > 0;
const paths = resolvePaths(selectors);

function run(label: string, command: string, args: readonly string[]): void {
  process.stdout.write(`\n▶ ${label}\n`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`✗ ${label} failed\n`);
    process.exit(result.status ?? 1);
  }
}

run('order:fix', 'tsx', ['scripts/order.ts', '--fix', ...selectors]);
run('lint:fix', 'oxlint', scoped ? ['--fix', ...paths] : ['--fix']);
run('format', 'oxfmt', scoped ? ['--write', ...paths] : ['--write', '.']);
