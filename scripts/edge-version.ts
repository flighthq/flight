// Computes the snapshot ("edge"/"next") version CI publishes on every push to a release channel,
// separate from the tag-triggered stable release (release.yml). The whole @flighthq/* graph shares
// one version (locked versioning), so this prints a single computed version plus the npm dist-tag to
// publish it under; the CI job stamps it with `version:packages` and publishes with
// `release -- --tag <tag>` so it lands on that channel and never touches `latest`.
//
// Scheme:
//   base    = @flighthq/sdk's current source version (the canonical latest; tag-independent, so a
//             missing or unpushed release tag never yields a stale base).
//   bumped  = base bumped by the highest conventional-commits level among the commits since the last
//             version tag — a `type!:` subject or a `BREAKING CHANGE:` footer is breaking, a `feat:` is
//             a feature, anything else is a fix. The lane decides which digit moves: pre-1.0 (base major
//             0) is the ZeroVer lane where everything shifts down one — breaking bumps the minor,
//             feature/fix bump the patch, and major stays 0. Once a real 1.0.0 lands the normal lane
//             applies (breaking -> major, feature -> minor, fix -> patch); the lane is keyed on the base
//             major, so it switches itself with no code change. Either way an edge build sorts *above*
//             the last release as its upcoming version, not as a prerelease of it.
//   version = <bumped>-<channel>.<count>.<sha>
//             channel  main -> edge, develop -> next   (this is also the dist-tag).
//             count    commits since the last version tag (`git rev-list --count <tag>..HEAD`),
//                      resetting to a small number each release, so it reads as "Nth build toward the
//                      next version" — monotonic within a release cycle, so edge builds sort in commit
//                      order (a numeric prerelease identifier). Falls back to the total commit count
//                      when no version tag is reachable. It is the real sort key, so the sha needs no
//                      ordering of its own.
//             <sha>    short commit sha, disambiguating the rare builds that share a <count>. (A hex
//                      sha that is all-digits with a leading zero is not a valid semver identifier —
//                      ~1 in a few hundred commits; tolerated as a one-off failed publish that
//                      self-heals on the next commit, rather than carrying a "g"-style prefix.)
//
// Prints `version=<v>` and `tag=<channel>` on stdout in GitHub Actions `$GITHUB_OUTPUT` key=value
// form, so the workflow captures them with `>> "$GITHUB_OUTPUT"`.
//
// Usage:
//   tsx scripts/edge-version.ts            branch from GITHUB_REF_NAME, else the current git branch
//   tsx scripts/edge-version.ts <branch>   compute for an explicit branch (main or develop)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type BumpLevel = 'breaking' | 'feature' | 'fix';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const branch = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? gitBranch();
const channel = channelForBranch(branch);
if (channel === undefined) {
  console.error(`[edge-version] branch "${branch}" is not a release channel (expected main or develop)`);
  process.exit(1);
}

// The commit range since the last release drives both the bump level and the build count.
const tag = lastVersionTag();
const range = tag === undefined ? 'HEAD' : `${tag}..HEAD`;
const version = `${applyBump(readSdkVersion(), detectBumpLevel(range))}-${channel}.${commitCount(range)}.${shortSha()}`;
process.stdout.write(`version=${version}\ntag=${channel}\n`);

// Apply a conventional-commits bump to the base, choosing which digit moves by the current lane. Pre-1.0
// (base major 0) is the ZeroVer lane: everything shifts down one — a breaking change bumps the minor, a
// feature or fix bumps the patch, and the major stays 0. Once a real 1.0.0 lands the base major is >= 1
// and the normal lane applies (breaking -> major, feature -> minor, fix -> patch). The lane is keyed on
// the base major, so the switch is automatic.
function applyBump(base: string, level: BumpLevel): string {
  const [major, minor, patch] = base.split('.').map((n) => Number.parseInt(n, 10));
  if (major === 0) {
    return level === 'breaking' ? `0.${minor + 1}.0` : `0.${minor}.${patch + 1}`;
  }
  if (level === 'breaking') return `${major + 1}.0.0`;
  if (level === 'feature') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// The highest conventional-commits level among the commits in `range` (breaking outranks feature
// outranks fix). Reads raw bodies NUL-delimited so a multi-line `BREAKING CHANGE:` footer stays intact.
function detectBumpLevel(range: string): BumpLevel {
  const messages = git('log', '--format=%B%x00', range)
    .split('\0')
    .map((m) => m.trim())
    .filter(Boolean);
  let level: BumpLevel = 'fix';
  for (const message of messages) {
    if (isBreakingCommit(message)) return 'breaking';
    if (isFeatureCommit(message)) level = 'feature';
  }
  return level;
}

// A `!` before the colon in the subject (`type!:` / `type(scope)!:`) marks a breaking change, as does a
// `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer line anywhere in the body.
function isBreakingCommit(message: string): boolean {
  const subject = message.split('\n', 1)[0];
  return /^[a-z]+(\([^)]*\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(message);
}

// A `feat:` / `feat(scope):` subject. A breaking `feat!:` is caught earlier by isBreakingCommit.
function isFeatureCommit(message: string): boolean {
  return /^feat(\([^)]*\))?:/.test(message.split('\n', 1)[0]);
}

// main -> the "edge" channel, develop -> the "next" channel; any other branch is not a publish target.
function channelForBranch(name: string): 'edge' | 'next' | undefined {
  if (name === 'main') return 'edge';
  if (name === 'develop') return 'next';
  return undefined;
}

// Commits in `range` (since the last release), so the number stays small and resets each version — a
// monotonic per-branch sort key. The caller passes `HEAD` when no version tag is reachable.
function commitCount(range: string): string {
  return git('rev-list', '--count', range);
}

function git(...args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function gitBranch(): string {
  return git('rev-parse', '--abbrev-ref', 'HEAD');
}

// The nearest reachable bare numeric version tag (0.2.0), matched so non-version tags (quimby/seed,
// prerebase-blend) can't stand in for it. `git describe` exits non-zero when none is reachable.
function lastVersionTag(): string | undefined {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', '[0-9]*.[0-9]*.[0-9]*');
  } catch {
    return undefined;
  }
}

function readSdkVersion(): string {
  const manifest = JSON.parse(readFileSync(join(root, 'packages', 'sdk', 'package.json'), 'utf8'));
  return manifest.version as string;
}

function shortSha(): string {
  return git('rev-parse', '--short=7', 'HEAD');
}
