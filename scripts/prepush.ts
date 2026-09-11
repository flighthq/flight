// Pre-push gate: a fast, change-scoped confidence check — deliberately NOT a copy of CI.
// CI (.github/workflows/tests.yml) runs the full build and the complete suite; this hook
// only runs what the push is likely to have affected, so it stays fast as the repo grows.
//
//   1. changed-file classify  — first, so a closed Markdown-only change can skip typecheck
//   2. typecheck              — unless every changed file is Markdown documentation
//   3. vitest run --changed   — only when package source changed; vitest walks the shared project's
//                               module graph from <base> and reruns affected fast-path tests.
//                               Tool-capture's browser contracts run once in CI through its package config.
//
// We let vitest derive the affected test set from its module graph (`--changed <base>`) rather than
// computing it ourselves from the package dependency graph. The root config now has multiple projects;
// this fast lane names `shared` explicitly so Vitest does not discover the serial tool-capture or other
// independently routed projects. Vitest's graph is finer-grained (per test file, by real imports) and
// needs no maintenance as packages are added; a module-graph edge it can't see (e.g. a computed dynamic
// import) only means that test slips to CI, never to production.
// Set FLIGHT_PREPUSH_VITEST_WORKERS to a positive integer to cap this hook's Vitest run on a constrained
// machine. Unset, Vitest receives no worker argument and retains its current default scheduling behavior.
//
// <base> is what the push is measured against. In the hook, git hands us on stdin the sha the
// remote already has (see readPushBase) — the exact "what am I newly pushing" boundary, so we never
// re-test commits a previous push already covered. Run manually (no stdin), we fall back to the
// branch's upstream, else origin/main, else the previous commit. Anything broader than "what
// changed" is CI's job, not this hook's.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Markdown is the entire allowlist. Everything else — including configuration, extensionless files,
// and extensions the hook does not know — defaults to typecheck. An empty or unreadable diff likewise
// fails closed instead of acquiring the vacuous "every file is documentation" interpretation.
export function shouldRunPrepushTypecheck(changedFiles: readonly string[] | null): boolean {
  return changedFiles === null || changedFiles.length === 0 || changedFiles.some((file) => !file.endsWith('.md'));
}

export function affectsSharedPackageTests(changedFiles: readonly string[]): boolean {
  return changedFiles.some(
    (file) => /^packages\/[^/]+\/src\/.+\.(ts|tsx)$/.test(file) && !file.startsWith('packages/tool-capture/'),
  );
}

export function resolveChangedTestArguments(base: string, workerCount?: string): string[] {
  const args = ['--project', 'shared', '--changed', base];
  if (workerCount === undefined || workerCount === '') return args;

  if (!/^[1-9]\d*$/.test(workerCount)) {
    throw new Error(
      `FLIGHT_PREPUSH_VITEST_WORKERS must be a positive integer; received ${JSON.stringify(workerCount)}`,
    );
  }
  return [...args, '--maxWorkers', workerCount];
}

function main(): void {
  const base = readPushBase() ?? resolveBase();
  const changed =
    base === null
      ? null
      : ((capture(`git diff --name-only ${base}...HEAD`) ?? undefined)?.split('\n').filter(Boolean) ?? null);

  if (shouldRunPrepushTypecheck(changed)) {
    run('npm run typecheck');
  } else {
    console.log(pc.dim('pre-push: Markdown-only change — skipping typecheck'));
  }

  if (base === null) {
    console.log(pc.yellow('pre-push: no base commit to diff against (initial commit?) — CI will cover the tests.'));
    return;
  }

  if (changed === null) {
    console.log(pc.yellow(`pre-push: could not diff against ${base} — CI will cover the tests.`));
    return;
  }

  console.log(pc.cyan(`pre-push: ${changed.length} file(s) changed vs ${base}`));

  if (affectsSharedPackageTests(changed)) {
    // Route through the repository wrapper so the structured completion gate also judges worker loss.
    run(`npm run test -- ${resolveChangedTestArguments(base, process.env.FLIGHT_PREPUSH_VITEST_WORKERS).join(' ')}`);
  } else {
    console.log(pc.dim('pre-push: no shared-project package source changed — skipping vitest'));
  }
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
