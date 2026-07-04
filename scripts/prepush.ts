// Pre-push gate: a fast, change-scoped confidence check — deliberately NOT a copy of CI.
// CI (.github/workflows/tests.yml) runs the full build and the complete suite; this hook
// only runs what the push is likely to have affected, so it stays fast as the repo grows.
//
//   1. typecheck             — always; incremental, catches cross-package type breakage
//   2. vitest --project=<pkg> — only the affected packages: the ones whose source changed
//                               plus everything that (transitively) depends on them
//   3. cargo test -p <crate>  — only the crates whose files changed in this push
//
// Why --project scoping, not `vitest --changed` alone: the root workspace declares ~100
// projects, and vitest loads every project's config before it can decide what to run — a
// fixed cost near two minutes that grows with the package count and is paid even when nothing
// matches. Naming the affected projects up front makes vitest load only those configs; a leaf
// edit resolves in seconds. We compute the affected set from the package dependency graph
// (see computeAffectedProjects) rather than leaning on vitest's git integration, so the scope
// is explicit and a correct superset of the module graph.
//
// <base> is what the push is measured against. In the hook, git hands us on stdin the sha
// the remote already has (see readPushBase) — the exact "what am I newly pushing" boundary,
// so we never re-test commits a previous push already covered. Run manually (no stdin), we
// fall back to the branch's upstream, else origin/main, else the previous commit. Anything
// broader than "what changed" is CI's job, not this hook's.
//
// Escape hatches: FAST_PUSH=1 skips the vitest step entirely (typecheck + cargo still run).
// A change to a widely-imported package legitimately fans out to most of the graph; when the
// affected count crosses WIDE_FANOUT_PROJECTS we make that slow wait visible and point at
// FAST_PUSH, rather than letting it look hung.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import pc from 'picocolors';

import { workspacePackages } from './workspaces';

// Above this many affected projects, the run is inherently slow (vitest reloads a config per
// project); warn and surface FAST_PUSH so the wait reads as expected, not stuck.
const WIDE_FANOUT_PROJECTS = 25;

// Pure re-export barrels: nearly every package is a (transitive) dependency, so they land in the
// affected set for almost any change, and loading one pulls the whole module graph through vite
// (~16s for @flighthq/sdk alone). Their tests only assert that re-exports exist — a broken one is
// already a typecheck failure (step 1), and CI runs the surface test in full. So we skip them as
// *dependents*; if the barrel itself is the edited package, it still runs.
const SKIP_AS_DEPENDENT = new Set(['@flighthq/sdk']);

const rootDir = path.resolve(__dirname, '..');

// Every workspace package's name, its repo-relative directory, and the @flighthq/* packages it
// depends on. Built once per run from package.json manifests (cheap — a few ms of small reads).
const packages = workspacePackages.map(({ name, dir }) => {
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const deps = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ].filter((dep) => dep.startsWith('@flighthq/'));
  return { name, relDir: path.relative(rootDir, dir), deps };
});

// The packages whose tests could be affected by `changedFiles`: the packages those files belong
// to, plus the transitive closure of packages that depend on them (a test can only break from a
// change it imports, and package.json deps are a correct superset of what a package's tests
// import). Returns @flighthq/* package names. Empty means "nothing mapped" — the caller falls back
// to a full run so a graph miss never silently skips tests.
function computeAffectedProjects(changedFiles: readonly string[]): string[] {
  const dependents = new Map<string, string[]>();
  for (const pkg of packages) {
    for (const dep of pkg.deps) {
      (dependents.get(dep) ?? dependents.set(dep, []).get(dep)!).push(pkg.name);
    }
  }

  const seed = new Set<string>();
  for (const file of changedFiles) {
    // Longest matching directory wins, so a file in a nested package maps to that package, not its parent.
    let owner: (typeof packages)[number] | null = null;
    for (const pkg of packages) {
      if (
        (file === pkg.relDir || file.startsWith(`${pkg.relDir}/`)) &&
        (!owner || pkg.relDir.length > owner.relDir.length)
      ) {
        owner = pkg;
      }
    }
    if (owner) seed.add(owner.name);
  }

  const affected = new Set(seed);
  const queue = [...affected];
  while (queue.length > 0) {
    const name = queue.shift()!;
    for (const dependent of dependents.get(name) ?? []) {
      if (!affected.has(dependent)) {
        affected.add(dependent);
        queue.push(dependent); // keep traversing through skipped barrels so their dependents are still reached
      }
    }
  }

  // Drop barrels reached only as a dependent; a barrel you edited directly stays in via `seed`.
  return [...affected].filter((name) => seed.has(name) || !SKIP_AS_DEPENDENT.has(name));
}

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
// Only package source (packages/<name>/src/**) sits in a colocated test's module graph, so only
// those changes can flip a vitest result — and `vitest --changed` can't see out-of-graph edits
// anyway. A push touching only scripts/, tools/, docs, or config skips vitest's multi-second
// workspace startup entirely (it would just print "No test files found"); CI still runs everything.
const affectsPackageTests = changed.some((file) => /^packages\/[^/]+\/src\/.+\.(ts|tsx)$/.test(file));
const changedCrates = [
  ...new Set(
    changed.map((file) => /^crates\/([^/]+)\//.exec(file)?.[1]).filter((crate): crate is string => Boolean(crate)),
  ),
  // Drop crates that no longer exist on disk: a push that deletes/renames a crate (e.g. a refactor
  // that splits one crate into several) still lists the removed crate's paths in the diff, but
  // `cargo test -p <gone-crate>` errors with "package ID specification did not match any packages".
].filter((crate) => existsSync(`crates/${crate}/Cargo.toml`));

console.log(pc.cyan(`pre-push: ${changed.length} file(s) changed vs ${base}`));

if (process.env.FAST_PUSH === '1') {
  console.log(
    pc.yellow('pre-push: FAST_PUSH=1 — skipping vitest (typecheck + cargo still run); CI covers the full suite.'),
  );
} else if (affectsPackageTests) {
  const affected = computeAffectedProjects(changed);
  if (affected.length === 0) {
    // A package source file changed but mapped to no known package (unexpected) — don't silently
    // skip its tests; fall back to the full changed-scoped run.
    console.log(pc.dim('pre-push: could not map changed source to a package — running the full changed set'));
    run(`npx vitest run --changed ${base}`);
  } else {
    if (affected.length > WIDE_FANOUT_PROJECTS) {
      console.log(
        pc.yellow(
          `pre-push: ${affected.length} package(s) affected — a widely-imported package changed, so this is slower. Set FAST_PUSH=1 to skip and let CI cover it.`,
        ),
      );
    } else {
      console.log(
        pc.cyan(
          `pre-push: ${affected.length} package(s) affected — ${affected.map((n) => n.replace('@flighthq/', '')).join(', ')}`,
        ),
      );
    }
    // Scope by path (vitest positional filters) rather than --project: the master config groups all
    // packages into a couple of env-shared projects, so per-package project names no longer exist.
    const relDirByName = new Map(packages.map((pkg) => [pkg.name, pkg.relDir]));
    const pathFilters = affected.map((name) => `${relDirByName.get(name)}/src/`);
    run(`npx vitest run ${pathFilters.join(' ')}`);
  }
} else {
  console.log(pc.dim('pre-push: no package source changed — skipping vitest'));
}

if (changedCrates.length > 0) {
  run(`cargo test ${changedCrates.map((crate) => `-p ${crate}`).join(' ')}`);
} else {
  console.log(pc.dim('pre-push: no crate changes — skipping cargo test'));
}
