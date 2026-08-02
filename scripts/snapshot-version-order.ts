// Orders the versions edge-version.ts produces, so a publish can refuse to drag a dist-tag backwards.
//
// A dist-tag is a mutable pointer, and `npm publish --tag next` moves it to whatever it just
// published — there is no publish-without-setting-a-tag. So when two builds for different commits
// reach the publish step out of commit order (their CI legs finish out of order, which the
// edge-publish concurrency group serializes but does not order), the older one would point `next` at
// an older snapshot. Skipping it loses nothing: develop is linear and `count` is monotonic, so the
// newer snapshot already on the tag contains the older commit's work.
//
// Deliberately narrow rather than a general semver implementation. It understands exactly the two
// shapes this repo publishes — `<major>.<minor>.<patch>` for a stable release and
// `<major>.<minor>.<patch>-<channel>.<count>.<sha>` for a snapshot — and treats ANYTHING it cannot
// parse as "not superseded". That direction is the safe one: a wrong `false` merely publishes, which
// is the pre-guard behavior, whereas a wrong `true` silently drops a snapshot AND leaves the tag
// stale. Adding a semver dependency for one comparison was the alternative; `semver` is only
// present transitively here, and depending on that is how a publish script breaks on an unrelated
// dependency bump.

interface ParsedVersion {
  base: readonly [number, number, number];
  // null for a stable release; the monotonic build count for a snapshot. `sha` is parsed but
  // discarded — edge-version.ts documents it as disambiguation only, never the sort key.
  count: number | null;
}

// True when `tagVersion` (what the dist-tag currently points at) is strictly newer than `version`
// (what this run is about to publish) — meaning publishing would move the tag backwards.
export function isSnapshotVersionSuperseded(version: string, tagVersion: string): boolean {
  const ours = parseVersion(version);
  const theirs = parseVersion(tagVersion);
  if (ours === null || theirs === null) return false;

  for (let index = 0; index < 3; index++) {
    const mine = ours.base[index] ?? 0;
    const other = theirs.base[index] ?? 0;
    if (other !== mine) return other > mine;
  }

  // Same base version. A stable release outranks any prerelease of that base, per semver.
  if (theirs.count === null) return ours.count !== null;
  if (ours.count === null) return false;
  return theirs.count > ours.count;
}

function parseVersion(version: string): ParsedVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9a-z-]+\.(\d+)\.[0-9a-z-]+)?$/i.exec(version.trim());
  if (match === null) return null;
  const [, major, minor, patch, count] = match;
  return {
    base: [Number(major), Number(minor), Number(patch)],
    count: count === undefined ? null : Number(count),
  };
}
