/**
 * Move a worktree's changes into a self-contained, git-free incoming bundle a reviewer can read with
 * no git. One engine, two directions — you name the OTHER worktree and the verb sets which way work
 * flows; both run on the host (git) and land a bundle in the destination's `incoming/`:
 *
 *   npm run get:worktree ../builder      # pull THEIR work into ./incoming (run from the reviewer)
 *   npm run send:worktree ../review      # push MY work into ../review/incoming (run from the source)
 *   npm run get:worktree ../builder -- --base=origin/main --out=./incoming
 *
 * Why this exists: work is produced by an agent in a sandbox that has the worktree *files* but no git
 * (the object store lives in the host's main checkout, which the sandbox doesn't mount). A reviewer
 * agent lives in a *different* sandbox, also without git. Neither can run `git diff`. This command runs
 * on the host — where git works — points at a worktree path, and writes a folder a reviewer can read
 * with no git at all: the committed baseline, the full working state, and a precomputed patch between
 * them. Bundles land under `incoming/` (the incoming of work pulled in for review).
 *
 * "snapshot" is deliberately avoided — it collides with the visual-testing screenshot snapshots. This
 * is an *incoming bundle*.
 *
 * Three change axes are kept disjoint so the counts mean what they say:
 *   - committed source   (base -> HEAD)
 *   - uncommitted source (HEAD -> working, tracked edits only, NO build artifacts)
 *   - build artifacts    (gitignored declaration output, force-captured separately)
 * A plain `git diff` drops the gitignored build output, so we stage the working tree into a throwaway
 * index (never touching the worktree's real index or creating a commit/ref), force-add the realized
 * public API surface, and `write-tree`. We write the index twice — once after the tracked-only `add -A`
 * (the source tree) and once after force-adding artifacts (the full tree) — so source and artifacts
 * never double-count.
 *
 * Artifacts default to the realized public API surface only: non-test `packages/<pkg>/dist/**.d.ts`.
 * Minified `.js`, source maps, and `examples/<app>/dist` bundles are unreviewable noise and excluded.
 * Override with `--artifacts=<substr,substr>` for a raw substring capture.
 *
 * Output layout (under <out>/<worktree>-<shorthead>/):
 *   MANIFEST.json   refs, disjoint counts, per-package buckets, artifact list — machine-readable handoff
 *   README.md       orientation for the reviewing agent: what each file is and how to review it
 *   changes.patch   base -> working+artifacts (the primary review artifact)
 *   committed.patch base -> HEAD (the work committed on this branch)
 *   working.patch   HEAD -> working (uncommitted tracked edits, no build artifacts)
 *   status.txt      git status --short --branch, plus the captured API artifacts
 *   base/           full source tree at the base ref (git archive)
 *   head/           full source tree at working state + captured .d.ts artifacts (git archive)
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

type WorktreeMode = 'get' | 'send';

interface Args {
  mode: WorktreeMode;
  target: string;
  base?: string;
  out: string;
  artifacts: string[];
  trees: boolean;
  json: boolean;
}

// Realized public API surface: a package's emitted declaration files, excluding test declarations.
// Minified .js, .map, and examples/<app>/dist bundles are excluded — they are not reviewable.
const API_ARTIFACT = /^packages\/[^/]+\/dist\/.*\.d\.ts$/;

// Run a git subcommand against the target worktree. `env` carries GIT_INDEX_FILE for the temp-index
// staging so we never disturb the worktree's real index. Returns trimmed stdout.
function git(target: string, gitArgs: readonly string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', ['-C', target, ...gitArgs], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 512,
    env: env ?? process.env,
  }).trim();
}

// git that returns '' instead of throwing — for ref probes that are allowed to miss.
function gitMaybe(target: string, gitArgs: readonly string[]): string {
  try {
    return git(target, gitArgs);
  } catch {
    return '';
  }
}

function parseArgs(argv: readonly string[]): Args {
  let mode = '';
  let worktree = '';
  let base: string | undefined;
  let outOverride: string | undefined;
  let artifacts: string[] = [];
  let trees = true;
  let json = false;
  // First positional is the mode (get|send), baked in by the npm script; second is the other worktree.
  for (const arg of argv) {
    if (arg === '--no-trees') trees = false;
    else if (arg === '--json') json = true;
    else if (arg.startsWith('--base=')) base = arg.slice('--base='.length);
    else if (arg.startsWith('--out=')) outOverride = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--artifacts=')) artifacts = arg.slice('--artifacts='.length).split(',').filter(Boolean);
    else if (!arg.startsWith('--')) {
      if (!mode) mode = arg;
      else if (!worktree) worktree = arg;
    }
  }
  if ((mode !== 'get' && mode !== 'send') || !worktree) {
    console.error(
      'usage:\n' +
        '  npm run get:worktree <source-worktree> -- [opts]   pull their work into ./incoming\n' +
        '  npm run send:worktree <dest-worktree>  -- [opts]   push my work into <dest>/incoming\n' +
        '  opts: [--base=<ref>] [--out=<dir>] [--artifacts=<sub,str>] [--no-trees] [--json]',
    );
    process.exit(1);
  }
  // get <source>: bundle the named worktree into the local ./incoming.
  // send <dest>:  bundle the CURRENT worktree (cwd) into the destination's incoming.
  const target = mode === 'get' ? path.resolve(worktree) : process.cwd();
  const defaultOut =
    mode === 'get' ? path.join(process.cwd(), 'incoming') : path.join(path.resolve(worktree), 'incoming');
  return { mode, target, base, out: outOverride ?? defaultOut, artifacts, trees, json };
}

// The base is the point this work should be reviewed against: where the branch diverged from main, so
// the bundle captures the whole body of work (committed + uncommitted). Falls back to HEAD (only
// uncommitted changes) when there is no main, then to the root commit.
function resolveBase(target: string, override?: string): { ref: string; sha: string } {
  if (override) return { ref: override, sha: git(target, ['rev-parse', override]) };
  const head = git(target, ['rev-parse', 'HEAD']);
  for (const candidate of ['main', 'origin/main', 'master']) {
    const sha = gitMaybe(target, ['merge-base', 'HEAD', candidate]);
    if (sha) return { ref: `merge-base(HEAD, ${candidate})`, sha };
  }
  return { ref: 'HEAD', sha: head };
}

// Ignored files present in the worktree that should be force-captured. Default: the realized public
// API surface (package .d.ts). With explicit `--artifacts` substrings, falls back to a raw include.
function listBuildArtifacts(target: string, substrings: readonly string[]): string[] {
  const ignored = gitMaybe(target, ['ls-files', '--others', '--ignored', '--exclude-standard']);
  if (!ignored) return [];
  const rows = ignored
    .split('\n')
    .filter(Boolean)
    .filter((p) => !p.startsWith('node_modules/') && !p.includes('/node_modules/'));
  if (substrings.length > 0) return rows.filter((p) => substrings.some((s) => p.includes(s)));
  return rows.filter((p) => API_ARTIFACT.test(p) && !p.endsWith('.test.d.ts'));
}

// Build two synthetic trees from a throwaway index (the worktree's real index, files, and refs are
// never touched): a SOURCE tree (tracked working changes only) and a FULL tree that also carries the
// force-added build artifacts. Writing the index twice keeps source and artifacts from double-counting.
function writeWorkingTrees(
  target: string,
  outDir: string,
  artifacts: readonly string[],
): { sourceTree: string; fullTree: string } {
  const indexFile = path.join(outDir, '.git-review-index');
  fs.rmSync(indexFile, { force: true });
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  git(target, ['read-tree', 'HEAD'], env); // seed from the committed state
  git(target, ['add', '-A'], env); // stage every tracked + new (non-ignored) working change
  const sourceTree = git(target, ['write-tree'], env);
  for (let i = 0; i < artifacts.length; i += 100) {
    git(target, ['add', '-f', '--', ...artifacts.slice(i, i + 100)], env); // force-add ignored build output
  }
  const fullTree = git(target, ['write-tree'], env);
  fs.rmSync(indexFile, { force: true });
  return { sourceTree, fullTree };
}

// Materialize a tree/ref as plain files via `git archive` (no .git, no node_modules — they aren't in
// the tree). Written through a tar intermediate to stay safe with spaces in paths.
function materialize(target: string, ref: string, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const tar = `${dir}.tar`;
  execFileSync('git', ['-C', target, 'archive', '--format=tar', '-o', tar, ref], { maxBuffer: 1024 * 1024 * 512 });
  execFileSync('tar', ['-x', '-f', tar, '-C', dir]);
  fs.rmSync(tar, { force: true });
}

function countPatchFiles(patch: string): number {
  return (patch.match(/^diff --git /gm) ?? []).length;
}

// Paths touched by a patch (the post-image b/ path; for renames that is the new path).
function changedPaths(patch: string): string[] {
  const paths = new Set<string>();
  for (const m of patch.matchAll(/^diff --git a\/.+? b\/(.+)$/gm)) paths.add(m[1]);
  return [...paths];
}

// Group the change by package: how many files under packages/<name>/ changed, and whether the worktree
// carries a status doc for it. This is the index a host-side ingest drives review over.
function packageBuckets(
  target: string,
  tree: string,
  changed: readonly string[],
): Record<string, { changedFiles: number; hasStatusDoc: boolean }> {
  const pkgNames = gitMaybe(target, ['ls-tree', '--name-only', tree, 'packages/'])
    .split('\n')
    .filter(Boolean)
    .map((p) => p.replace(/^packages\//, ''));
  const statusDocs = new Set(
    gitMaybe(target, ['ls-tree', '-r', '--name-only', tree, 'agents/status/'])
      .split('\n')
      .filter((p) => p.endsWith('.md'))
      .map((p) => path.basename(p, '.md')),
  );
  const out: Record<string, { changedFiles: number; hasStatusDoc: boolean }> = {};
  for (const name of pkgNames.sort()) {
    const prefix = `packages/${name}/`;
    const changedFiles = changed.filter((p) => p.startsWith(prefix)).length;
    const hasStatusDoc = statusDocs.has(name);
    if (changedFiles > 0 || hasStatusDoc) out[name] = { changedFiles, hasStatusDoc };
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (gitMaybe(args.target, ['rev-parse', '--is-inside-work-tree']) !== 'true') {
  console.error(`Not a git worktree (or git can't reach it here): ${args.target}`);
  process.exit(1);
}

const headSha = git(args.target, ['rev-parse', 'HEAD']);
const branch = gitMaybe(args.target, ['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)';
const base = resolveBase(args.target, args.base);
const dirty = gitMaybe(args.target, ['status', '--porcelain']).length > 0;

const name = path.basename(args.target);
const bundleDir = path.join(args.out, `${name}-${headSha.slice(0, 9)}`);
fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });

const buildArtifacts = listBuildArtifacts(args.target, args.artifacts);
const { sourceTree, fullTree } = writeWorkingTrees(args.target, bundleDir, buildArtifacts);

const changesPatch = git(args.target, ['diff', '-M', `${base.sha}..${fullTree}`]);
const committedPatch = git(args.target, ['diff', '-M', `${base.sha}..${headSha}`]);
const workingPatch = git(args.target, ['diff', '-M', `${headSha}..${sourceTree}`]); // source only — no artifacts

fs.writeFileSync(path.join(bundleDir, 'changes.patch'), `${changesPatch}\n`);
fs.writeFileSync(path.join(bundleDir, 'committed.patch'), `${committedPatch}\n`);
fs.writeFileSync(path.join(bundleDir, 'working.patch'), `${workingPatch}\n`);

const statusTxt = [
  git(args.target, ['status', '--short', '--branch']),
  '',
  `# API artifacts captured (gitignored .d.ts, force-included in head/ and changes.patch): ${buildArtifacts.length}`,
  ...buildArtifacts.map((p) => `  ${p}`),
].join('\n');
fs.writeFileSync(path.join(bundleDir, 'status.txt'), `${statusTxt}\n`);

if (args.trees) {
  materialize(args.target, base.sha, path.join(bundleDir, 'base'));
  materialize(args.target, fullTree, path.join(bundleDir, 'head'));
}

const packages = packageBuckets(args.target, fullTree, changedPaths(changesPatch));
const manifest = {
  target: args.target,
  worktree: name,
  branch,
  headSha,
  base: { ref: base.ref, sha: base.sha },
  dirty,
  generatedIn: process.cwd(),
  changedFiles: countPatchFiles(changesPatch),
  committedFiles: countPatchFiles(committedPatch),
  uncommittedFiles: countPatchFiles(workingPatch),
  artifactFiles: buildArtifacts.length,
  packages,
  buildArtifacts,
  trees: args.trees,
};
fs.writeFileSync(path.join(bundleDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const pkgCount = Object.keys(packages).length;
const statusDocCount = Object.values(packages).filter((p) => p.hasStatusDoc).length;
const readme = `# Incoming bundle — ${name} @ ${headSha.slice(0, 9)}

Self-contained, git-free review bundle of \`${args.target}\`.
Base: ${base.ref} (${base.sha.slice(0, 9)}). Branch: ${branch}.${dirty ? ' Working tree was dirty.' : ''}

## What changed
- **${manifest.committedFiles}** committed source files, **${manifest.uncommittedFiles}** uncommitted source files.
- ${manifest.artifactFiles} gitignored API artifacts (\`.d.ts\`) captured (see \`status.txt\`).
- ${pkgCount} packages touched; ${statusDocCount} carry a status doc. See \`MANIFEST.json\` › \`packages\`.

## How to review (no git needed)
- \`changes.patch\` — the full delta, base → working state including \`.d.ts\` artifacts. Start here.
- \`committed.patch\` / \`working.patch\` — split the delta into committed vs not-yet-committed (source only).
- \`base/\` vs \`head/\` — full source trees before and after, for reading unchanged neighbors in context.
- \`MANIFEST.json\` › \`packages\` — per-package change counts + which have a status doc; the ingest index.
- **Status docs:** \`head/agents/status/<pkg>.md\` are the worker's per-package handoffs.
- **API surface:** \`head/packages/<pkg>/dist/*.d.ts\` is the realized public API (declarations only).

Review against the per-package charter and contract in \`head/agents/packages/<pkg>/\`.
Findings should reference \`${headSha.slice(0, 9)}:<path>\` plus a quoted snippet (line numbers drift).
`;
fs.writeFileSync(path.join(bundleDir, 'README.md'), readme);

if (args.json) {
  console.log(JSON.stringify({ ...manifest, bundleDir }, null, 2));
} else {
  console.log(`Wrote incoming bundle → ${bundleDir}`);
  console.log(
    `  ${manifest.committedFiles} committed + ${manifest.uncommittedFiles} uncommitted source, ${manifest.artifactFiles} API artifacts, ${pkgCount} packages (${statusDocCount} with status docs).`,
  );
  console.log(
    `  base: ${base.ref} ${base.sha.slice(0, 9)} · head: ${headSha.slice(0, 9)}${args.trees ? ' · base/ + head/ trees' : ' · patches only'}`,
  );
}
