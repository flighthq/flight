/**
 * Bundle a worktree's changes into a self-contained, git-free review folder.
 *
 *   npm run review:snapshot ../render
 *   npm run review:snapshot ../render -- --base=main --out=./review
 *
 * Why this exists: work is produced by an agent in a sandbox that has the worktree *files* but no git
 * (the object store lives in the host's main checkout, which the sandbox doesn't mount). A reviewer
 * agent lives in a *different* sandbox, also without git. Neither can run `git diff`. This command runs
 * on the host — where git works — points at a worktree path, and writes a folder a reviewer can read
 * with no git at all: the committed baseline, the full working state including uncommitted built
 * artifacts, and a precomputed patch between them.
 *
 * The hard part is "uncommitted built artifacts": dist output is gitignored, so a plain `git diff`
 * skips it. We stage the working tree into a throwaway index (never touching the worktree's real index
 * or creating a commit/ref), force-add the ignored build outputs, and `write-tree`. That synthetic tree
 * is the "head": one `git diff base..tree` and one `git archive tree` then cover source edits and built
 * output uniformly.
 *
 * Output layout (under <out>/<worktree>-<shorthead>/):
 *   MANIFEST.json   refs, counts, artifact list, dirty flag — machine-readable handoff metadata
 *   README.md       orientation for the reviewing agent: what each file is and how to review it
 *   changes.patch   base -> working+built (the primary review artifact; tracked + forced artifacts)
 *   committed.patch base -> HEAD (the work that was committed on this branch)
 *   working.patch   HEAD -> working (uncommitted tracked edits, no build artifacts)
 *   status.txt      git status --short --branch, plus the captured ignored build artifacts
 *   base/           full source tree at the base ref (git archive)
 *   head/           full source tree at working state + built artifacts (git archive of the synth tree)
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Args {
  target: string;
  base?: string;
  out: string;
  artifacts: string[];
  trees: boolean;
  json: boolean;
}

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
  let target = '';
  let base: string | undefined;
  let out = path.join(process.cwd(), 'review');
  let artifacts = ['/dist/'];
  let trees = true;
  let json = false;
  for (const arg of argv) {
    if (arg === '--no-trees') trees = false;
    else if (arg === '--json') json = true;
    else if (arg.startsWith('--base=')) base = arg.slice('--base='.length);
    else if (arg.startsWith('--out=')) out = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--artifacts=')) artifacts = arg.slice('--artifacts='.length).split(',').filter(Boolean);
    else if (!arg.startsWith('--') && !target) target = arg;
  }
  if (!target) {
    console.error(
      'usage: npm run review:snapshot <worktree-path> -- [--base=<ref>] [--out=<dir>] [--artifacts=<sub,str>] [--no-trees] [--json]',
    );
    process.exit(1);
  }
  return { target: path.resolve(target), base, out, artifacts, trees, json };
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

// Ignored files present in the worktree that look like build output (default: any path containing
// "/dist/"). These are what `git diff` would silently drop, so we force-add them into the temp index.
function listBuildArtifacts(target: string, substrings: readonly string[]): string[] {
  const ignored = gitMaybe(target, ['ls-files', '--others', '--ignored', '--exclude-standard']);
  if (!ignored) return [];
  return ignored
    .split('\n')
    .filter(Boolean)
    .filter((p) => !p.startsWith('node_modules/') && !p.includes('/node_modules/'))
    .filter((p) => substrings.some((s) => p.includes(s)));
}

// Build a synthetic tree object capturing the full working state plus the ignored build artifacts,
// using a throwaway index so the worktree's real index, working files, and refs are never touched.
function writeWorkingTree(target: string, outDir: string, artifacts: readonly string[]): string {
  const indexFile = path.join(outDir, '.git-review-index');
  fs.rmSync(indexFile, { force: true });
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  git(target, ['read-tree', 'HEAD'], env); // seed from the committed state
  git(target, ['add', '-A'], env); // stage every tracked + new (non-ignored) working change
  for (let i = 0; i < artifacts.length; i += 100) {
    git(target, ['add', '-f', '--', ...artifacts.slice(i, i + 100)], env); // force-add ignored build output
  }
  const tree = git(target, ['write-tree'], env);
  fs.rmSync(indexFile, { force: true });
  return tree;
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
const headTree = writeWorkingTree(args.target, bundleDir, buildArtifacts);

const changesPatch = git(args.target, ['diff', '-M', `${base.sha}..${headTree}`]);
const committedPatch = git(args.target, ['diff', '-M', `${base.sha}..${headSha}`]);
const workingPatch = git(args.target, ['diff', '-M', `${headSha}..${headTree}`]);

fs.writeFileSync(path.join(bundleDir, 'changes.patch'), `${changesPatch}\n`);
fs.writeFileSync(path.join(bundleDir, 'committed.patch'), `${committedPatch}\n`);
fs.writeFileSync(path.join(bundleDir, 'working.patch'), `${workingPatch}\n`);

const statusTxt = [
  git(args.target, ['status', '--short', '--branch']),
  '',
  `# Build artifacts captured (gitignored, force-included in head/ and changes.patch): ${buildArtifacts.length}`,
  ...buildArtifacts.map((p) => `  ${p}`),
].join('\n');
fs.writeFileSync(path.join(bundleDir, 'status.txt'), `${statusTxt}\n`);

if (args.trees) {
  materialize(args.target, base.sha, path.join(bundleDir, 'base'));
  materialize(args.target, headTree, path.join(bundleDir, 'head'));
}

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
  buildArtifacts,
  trees: args.trees,
};
fs.writeFileSync(path.join(bundleDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const readme = `# Review snapshot — ${name} @ ${headSha.slice(0, 9)}

Self-contained, git-free review bundle of \`${args.target}\`.
Base: ${base.ref} (${base.sha.slice(0, 9)}). Branch: ${branch}.${dirty ? ' Working tree was dirty.' : ''}

## What changed
- **${manifest.changedFiles}** files changed overall (committed + uncommitted + built artifacts)
- ${manifest.committedFiles} in committed work, ${manifest.uncommittedFiles} uncommitted (source)
- ${buildArtifacts.length} gitignored build artifacts captured (see \`status.txt\`)

## How to review (no git needed)
- \`changes.patch\` — the full delta, base → working state including built artifacts. Start here.
- \`committed.patch\` / \`working.patch\` — split the delta into committed vs not-yet-committed.
- \`base/\` vs \`head/\` — full source trees before and after, for reading unchanged neighbors in context.
- **Direction review:** \`head/tools/agents/docs/status/*.md\` are the status docs; judge them against the
  roadmap in \`head/tools/agents/docs/\`.
- **Code-merits review:** read \`changes.patch\`, open \`base/\`/\`head/\` for context, check \`head/packages/*/dist\`
  for the realized public API surface.

Findings should reference \`${headSha.slice(0, 9)}:<path>\` plus a quoted snippet (line numbers drift).
`;
fs.writeFileSync(path.join(bundleDir, 'README.md'), readme);

if (args.json) {
  console.log(JSON.stringify({ ...manifest, bundleDir }, null, 2));
} else {
  console.log(`Wrote review snapshot → ${bundleDir}`);
  console.log(
    `  ${manifest.changedFiles} changed (${manifest.committedFiles} committed, ${manifest.uncommittedFiles} uncommitted source), ${buildArtifacts.length} build artifacts.`,
  );
  console.log(
    `  base: ${base.ref} ${base.sha.slice(0, 9)} · head: ${headSha.slice(0, 9)}${args.trees ? ' · base/ + head/ trees' : ' · patches only'}`,
  );
}
