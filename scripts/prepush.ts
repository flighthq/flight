// Pre-push gate: a fast, change-scoped confidence check — deliberately NOT a copy of CI.
// CI (.github/workflows/tests.yml) runs the full build and the complete suite; this hook
// only runs what the push is likely to have affected, so it stays fast as the repo grows.
//
//   1. typecheck              — always; incremental, catches cross-package type breakage
//   2. vitest run --changed   — only when package source changed; vitest walks its own module
//                               graph from <base> and reruns affected fast-path tests. Tool-capture's
//                               browser contracts run once in CI through its package config.
//
// We let vitest derive the affected test set from its module graph (`--changed <base>`) rather than
// computing it ourselves from the package dependency graph. The root vitest config is a single
// non-isolated jsdom project (see vitest.config.ts), so there is no longer a per-project config-load
// cost to dodge — that fixed cost (near two minutes across ~100 projects) was the only reason the
// old hand-rolled affected-set traversal existed. vitest's graph is finer-grained (per test file, by
// real imports) and needs no maintenance as packages are added; a module-graph edge it can't see
// (e.g. a computed dynamic import) only means that test slips to CI, never to production.
//
// <base> is what the push is measured against. In the hook, git hands us on stdin the sha the
// remote already has (see readPushBase) — the exact "what am I newly pushing" boundary, so we never
// re-test commits a previous push already covered. Run manually (no stdin), we fall back to the
// branch's upstream, else origin/main, else the previous commit. Anything broader than "what
// changed" is CI's job, not this hook's.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import pc from 'picocolors';

function capture(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// A git pre-push hook receives, one line per ref being pushed, on stdin:
//   <local ref> <local sha> <remote ref> <remote sha>
// <remote sha> is the commit the remote already has — the true base for "what am I newly
// pushing". All-zero shas mark a ref the remote lacks: a branch deletion (zero local) or a
// brand-new branch (zero remote); neither yields a usable base, so we fall back.
function readPushBase(): string | null {
  if (process.stdin.isTTY) return null; // invoked manually, not by the hook — no ref info
  let raw: string;
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return null;
  }
  const zero = /^0+$/;
  for (const line of raw.split('\n').filter(Boolean)) {
    const [, localSha, , remoteSha] = line.split(/\s+/);
    if (!localSha || zero.test(localSha)) continue; // branch deletion — nothing to test here
    if (!remoteSha || zero.test(remoteSha)) return null; // new branch on the remote — no base
    return capture(`git rev-parse --verify --quiet ${remoteSha}^{commit}`) ? remoteSha : null;
  }
  return null;
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

const base = readPushBase() ?? resolveBase();

run('npm run typecheck');

if (!base) {
  console.log(pc.yellow('pre-push: no base commit to diff against (initial commit?) — CI will cover the tests.'));
  process.exit(0);
}

const changed = (capture(`git diff --name-only ${base}...HEAD`) ?? '').split('\n').filter(Boolean);
// Only fast-path package source sits in a colocated test's module graph, so only those changes can
// flip a result here. Tool-capture source is still compiled by typecheck, while its tests run in the
// per-package CI lane. A push touching only tool-capture, scripts/, tools/, docs, or config skips
// vitest's workspace startup entirely; CI still runs everything.
const affectsFastPackageTests = changed.some(
  (file) => /^packages\/[^/]+\/src\/.+\.(ts|tsx)$/.test(file) && !file.startsWith('packages/tool-capture/'),
);

console.log(pc.cyan(`pre-push: ${changed.length} file(s) changed vs ${base}`));

if (affectsFastPackageTests) {
  run(`npx vitest run --changed ${base}`);
} else {
  console.log(pc.dim('pre-push: no fast-path package source changed — skipping vitest'));
}
