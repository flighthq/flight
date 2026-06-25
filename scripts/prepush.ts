// Pre-push gate: a fast, change-scoped confidence check — deliberately NOT a copy of CI.
// CI (.github/workflows/tests.yml) runs the full build and the complete suite; this hook
// only runs what the push is likely to have affected, so it stays fast as the repo grows.
//
//   1. typecheck            — always; incremental, catches cross-package type breakage
//   2. vitest --changed     — graph-aware: a leaf change runs a few tests, a core change
//                             reruns everything that imports it
//   3. cargo test -p <crate> — only the crates whose files changed in this push
//
// <base> is what the push is measured against: the branch's upstream, else origin/main,
// else the previous commit. Anything broader than "what changed" is CI's job, not this hook's.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import pc from 'picocolors';

function capture(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function resolveBase(): string | null {
  const upstream = capture('git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"');
  if (upstream) return upstream;
  for (const ref of ['origin/main', 'main']) {
    if (capture(`git rev-parse --verify --quiet ${ref}`)) return ref;
  }
  return capture('git rev-parse --verify --quiet HEAD~1') ? 'HEAD~1' : null;
}

function run(cmd: string): void {
  console.log(pc.dim(`$ ${cmd}`));
  execSync(cmd, { stdio: 'inherit' });
}

const base = resolveBase();

run('npm run typecheck');

if (!base) {
  console.log(pc.yellow('pre-push: no base commit to diff against (initial commit?) — CI will cover the tests.'));
  process.exit(0);
}

const changed = (capture(`git diff --name-only ${base}...HEAD`) ?? '').split('\n').filter(Boolean);
const hasTypeScriptChange = changed.some((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
const changedCrates = [
  ...new Set(
    changed.map((file) => /^crates\/([^/]+)\//.exec(file)?.[1]).filter((crate): crate is string => Boolean(crate)),
  ),
  // Drop crates that no longer exist on disk: a push that deletes/renames a crate (e.g. a refactor
  // that splits one crate into several) still lists the removed crate's paths in the diff, but
  // `cargo test -p <gone-crate>` errors with "package ID specification did not match any packages".
].filter((crate) => existsSync(`crates/${crate}/Cargo.toml`));

console.log(pc.cyan(`pre-push: ${changed.length} file(s) changed vs ${base}`));

if (hasTypeScriptChange) {
  run(`npx vitest run --changed ${base} --project='!size'`);
} else {
  console.log(pc.dim('pre-push: no TypeScript changes — skipping vitest'));
}

if (changedCrates.length > 0) {
  run(`cargo test ${changedCrates.map((crate) => `-p ${crate}`).join(' ')}`);
} else {
  console.log(pc.dim('pre-push: no crate changes — skipping cargo test'));
}
