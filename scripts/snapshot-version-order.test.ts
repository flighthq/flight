import { describe, expect, it } from 'vitest';

import { isSnapshotVersionSuperseded } from './snapshot-version-order.js';

describe('isSnapshotVersionSuperseded', () => {
  it('supersedes an older snapshot by build count', () => {
    // The real out-of-order case: commit 1512's publish runs after commit 1514's has landed.
    expect(isSnapshotVersionSuperseded('0.3.0-next.1512.edc0fee', '0.3.0-next.1514.a24d43f')).toBe(true);
  });

  it('does not supersede when this build is newer than the tag', () => {
    expect(isSnapshotVersionSuperseded('0.3.0-next.1514.a24d43f', '0.3.0-next.1512.edc0fee')).toBe(false);
  });

  it('does not supersede an identical version', () => {
    // Equal is not "behind" — the already-published check owns this case, not the tag guard.
    expect(isSnapshotVersionSuperseded('0.3.0-next.1514.a24d43f', '0.3.0-next.1514.a24d43f')).toBe(false);
  });

  it('ignores the sha when counts differ', () => {
    // sha is disambiguation only; an alphabetically larger sha must not outrank a higher count.
    expect(isSnapshotVersionSuperseded('0.3.0-next.1512.fffffff', '0.3.0-next.1513.0000000')).toBe(true);
  });

  it('orders by base version ahead of build count', () => {
    // count resets at each release tag, so a lower count on a higher base is still newer.
    expect(isSnapshotVersionSuperseded('0.3.0-next.1514.a24d43f', '0.4.0-next.3.abc1234')).toBe(true);
    expect(isSnapshotVersionSuperseded('0.4.0-next.3.abc1234', '0.3.0-next.1514.a24d43f')).toBe(false);
  });

  it('orders each base segment numerically, not lexically', () => {
    // '9' > '10' as strings; the comparison must not agree.
    expect(isSnapshotVersionSuperseded('0.9.0-next.1.abc1234', '0.10.0-next.1.abc1234')).toBe(true);
    expect(isSnapshotVersionSuperseded('0.10.0-next.1.abc1234', '0.9.0-next.1.abc1234')).toBe(false);
  });

  it('ranks a stable release above a prerelease of the same base', () => {
    expect(isSnapshotVersionSuperseded('0.3.0-next.1514.a24d43f', '0.3.0')).toBe(true);
    expect(isSnapshotVersionSuperseded('0.3.0', '0.3.0-next.1514.a24d43f')).toBe(false);
  });

  it('compares two stable releases', () => {
    // The release.yml path: publishing `latest` out of tag order.
    expect(isSnapshotVersionSuperseded('0.2.0', '0.3.0')).toBe(true);
    expect(isSnapshotVersionSuperseded('0.3.0', '0.2.0')).toBe(false);
  });

  it('treats an unparseable version as not superseded, so the publish still happens', () => {
    // The conservative direction: never silently drop a publish because a version shape was
    // unexpected. Covers a hand-published tag, a v-prefix, or an empty dist-tag entry.
    expect(isSnapshotVersionSuperseded('0.3.0-next.1512.edc0fee', 'v0.4.0')).toBe(false);
    expect(isSnapshotVersionSuperseded('0.3.0-next.1512.edc0fee', 'nightly')).toBe(false);
    expect(isSnapshotVersionSuperseded('0.3.0-next.1512.edc0fee', '')).toBe(false);
    expect(isSnapshotVersionSuperseded('not-a-version', '0.4.0')).toBe(false);
  });
});
