// Computes the snapshot ("edge"/"next") version CI publishes on every push to a release channel,
// separate from the tag-triggered stable release (release.yml). The whole @flighthq/* graph shares
// one version (locked versioning), so this prints a single computed version plus the npm dist-tag to
// publish it under; the CI job stamps it with `version:packages` and publishes with
// `release -- --tag <tag>` so it lands on that channel and never touches `latest`.
//
// Scheme (ZeroVer / semver §4 — major pinned at 0 pre-1.0):
//   base    = @flighthq/sdk's current source version (the canonical latest; tag-independent, so a
//             missing or unpushed release tag never yields a stale base).
//   bumped  = base with the patch digit +1 (the default "feature"-level bump), so an edge build sorts
//             *above* the last release rather than as a prerelease of it. A breaking change bumps the
//             minor digit instead (0.2.0 -> 0.3.0); conventional commits can later drive the level.
//   version = <bumped>-<channel>.<count>.<sha>
//             channel  main -> edge, develop -> next   (this is also the dist-tag).
//             count    `git rev-list --count HEAD`, monotonic per branch, so edge builds within a
//                      channel sort in commit order (a numeric prerelease identifier). It is the real
//                      sort key, so the sha needs no ordering of its own.
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const branch = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? gitBranch();
const channel = channelForBranch(branch);
if (channel === undefined) {
  console.error(`[edge-version] branch "${branch}" is not a release channel (expected main or develop)`);
  process.exit(1);
}

const version = `${bumpVersion(readSdkVersion())}-${channel}.${commitCount()}.${shortSha()}`;
process.stdout.write(`version=${version}\ntag=${channel}\n`);

// ZeroVer bump: patch +1 is the default "feature"-level step (0.2.0 -> 0.2.1); a breaking change bumps
// the minor digit and resets patch (0.2.0 -> 0.3.0). Major stays 0 until an explicit 1.0.
function bumpVersion(base: string, level: 'feature' | 'breaking' = 'feature'): string {
  const [major, minor, patch] = base.split('.').map((n) => Number.parseInt(n, 10));
  return level === 'breaking' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

// main -> the "edge" channel, develop -> the "next" channel; any other branch is not a publish target.
function channelForBranch(name: string): 'edge' | 'next' | undefined {
  if (name === 'main') return 'edge';
  if (name === 'develop') return 'next';
  return undefined;
}

function commitCount(): string {
  return git('rev-list', '--count', 'HEAD');
}

function git(...args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function gitBranch(): string {
  return git('rev-parse', '--abbrev-ref', 'HEAD');
}

function readSdkVersion(): string {
  const manifest = JSON.parse(readFileSync(join(root, 'packages', 'sdk', 'package.json'), 'utf8'));
  return manifest.version as string;
}

function shortSha(): string {
  return git('rev-parse', '--short=7', 'HEAD');
}
