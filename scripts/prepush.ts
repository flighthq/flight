// Pre-push gate: a fast, change-scoped confidence check — deliberately NOT a copy of CI.
// CI (.github/workflows/tests.yml) runs the full build and the complete suite; this hook
// only runs what the push is likely to have affected, so it stays fast as the repo grows.
//
//   1. typecheck            — always; incremental, catches cross-package type breakage
//   2. vitest --changed     — graph-aware: a leaf change runs a few tests, a core change
//                             reruns everything that imports it
//   3. cargo test -p <crate> — only the crates whose files changed in this push
//
// <base> is what the push is measured against. In the hook, git hands us on stdin the sha
// the remote already has (see readPushBase) — the exact "what am I newly pushing" boundary,
// so we never re-test commits a previous push already covered. Run manually (no stdin), we
// fall back to the branch's upstream, else origin/main, else the previous commit. Anything
// broader than "what changed" is CI's job, not this hook's.
//
// Escape hatches: FAST_PUSH=1 skips the vitest step entirely (typecheck + cargo still run).
// Editing a core package (see CORE_PACKAGES) legitimately fans out to the whole downstream
// suite — we make that wait visible rather than silent, and point at FAST_PUSH.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import pc from 'picocolors';

// Packages nearly everything imports: a change here expands "what changed" to ~the whole SDK.
const CORE_PACKAGES = ['entity', 'geometry', 'math', 'node', 'signals', 'types'];

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
const hasTypeScriptChange = changed.some((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
const changedCrates = [
  ...new Set(
    changed.map((file) => /^crates\/([^/]+)\//.exec(file)?.[1]).filter((crate): crate is string => Boolean(crate)),
  ),
  // Drop crates that no longer exist on disk: a push that deletes/renames a crate (e.g. a refactor
  // that splits one crate into several) still lists the removed crate's paths in the diff, but
  // `cargo test -p <gone-crate>` errors with "package ID specification did not match any packages".
].filter((crate) => existsSync(`crates/${crate}/Cargo.toml`));

const changedCorePackages = CORE_PACKAGES.filter((pkg) => changed.some((file) => file.startsWith(`packages/${pkg}/`)));

console.log(pc.cyan(`pre-push: ${changed.length} file(s) changed vs ${base}`));

if (process.env.FAST_PUSH === '1') {
  console.log(
    pc.yellow('pre-push: FAST_PUSH=1 — skipping vitest (typecheck + cargo still run); CI covers the full suite.'),
  );
} else if (hasTypeScriptChange) {
  if (changedCorePackages.length > 0) {
    console.log(
      pc.yellow(
        `pre-push: core package(s) changed (${changedCorePackages.join(', ')}) — running the full downstream suite, which is slow. Set FAST_PUSH=1 to skip and let CI cover it.`,
      ),
    );
  }
  run(`npx vitest run --changed ${base} --project='!size'`);
} else {
  console.log(pc.dim('pre-push: no TypeScript changes — skipping vitest'));
}

if (changedCrates.length > 0) {
  run(`cargo test ${changedCrates.map((crate) => `-p ${crate}`).join(' ')}`);
} else {
  console.log(pc.dim('pre-push: no crate changes — skipping cargo test'));
}
