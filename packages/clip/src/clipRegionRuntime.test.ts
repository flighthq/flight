import { describe, expect, it } from 'vitest';

import {
  acquireClipRegionFromPool,
  clipRegionStateStateStore,
  createClipRegionState,
  getClipRegionContoursGuard,
  isClipRegionReleased,
  releaseClipRegionToPool,
  setClipRegionContoursGuardSlot,
  setClipRegionReleaseGuardSlot,
  setClipRegionUseGuardSlot,
  snapshotClipRegionReleaseGuard,
  snapshotClipRegionUseGuard,
} from './clipRegionRuntime.ts';
import { acquireClipRegion } from './contract.ts';

describe('acquireClipRegionFromPool', () => {
  it('removes the most recently pooled region', () => {
    const clip = acquireClipRegion();
    releaseClipRegionToPool(clip);
    expect(acquireClipRegionFromPool()).toBe(clip);
  });
});

describe('createClipRegionState', () => {
  it('stores an aggregate privately', () => {
    const created = createClipRegionState();
    expect(clipRegionStateStateStore.has(created)).toBe(true);
    expect(Object.keys(created)).toEqual([]);
  });
});

describe('getClipRegionContoursGuard', () => {
  it('reads the current contour guard', () => {
    const guard = () => undefined;
    setClipRegionContoursGuardSlot(guard);
    expect(getClipRegionContoursGuard()).toBe(guard);
    setClipRegionContoursGuardSlot(null);
  });
});

describe('isClipRegionReleased', () => {
  it('checks membership in the logical pool', () => {
    const clip = acquireClipRegion();
    expect(isClipRegionReleased(clip)).toBe(false);
    releaseClipRegionToPool(clip);
    expect(isClipRegionReleased(clip)).toBe(true);
    expect(acquireClipRegionFromPool()).toBe(clip);
  });
});

describe('releaseClipRegionToPool', () => {
  it('adds a region to the logical pool', () => {
    const clip = acquireClipRegion();
    releaseClipRegionToPool(clip);
    expect(isClipRegionReleased(clip)).toBe(true);
    expect(acquireClipRegionFromPool()).toBe(clip);
  });
});

describe('setClipRegionContoursGuardSlot', () => {
  it('replaces and clears the contour guard', () => {
    const guard = () => undefined;
    setClipRegionContoursGuardSlot(guard);
    expect(getClipRegionContoursGuard()).toBe(guard);
    setClipRegionContoursGuardSlot(null);
    expect(getClipRegionContoursGuard()).toBeNull();
  });
});

describe('setClipRegionReleaseGuardSlot', () => {
  it('replaces and clears the release guard', () => {
    const clip = acquireClipRegion();
    const guard = () => undefined;
    setClipRegionReleaseGuardSlot(guard);
    expect(snapshotClipRegionReleaseGuard(clip)).toEqual([guard, false]);
    setClipRegionReleaseGuardSlot(null);
    expect(snapshotClipRegionReleaseGuard(clip)).toEqual([null, false]);
  });
});

describe('setClipRegionUseGuardSlot', () => {
  it('replaces and clears the use guard', () => {
    const clip = acquireClipRegion();
    const guard = () => undefined;
    setClipRegionUseGuardSlot(guard);
    expect(snapshotClipRegionUseGuard(clip)).toEqual([guard, false]);
    setClipRegionUseGuardSlot(null);
    expect(snapshotClipRegionUseGuard(clip)).toEqual([null, false]);
  });
});

describe('snapshotClipRegionReleaseGuard', () => {
  it('returns the guard and release state atomically', () => {
    const clip = acquireClipRegion();
    const guard = () => undefined;
    setClipRegionReleaseGuardSlot(guard);
    expect(snapshotClipRegionReleaseGuard(clip)).toEqual([guard, false]);
    releaseClipRegionToPool(clip);
    expect(snapshotClipRegionReleaseGuard(clip)).toEqual([guard, true]);
    expect(acquireClipRegionFromPool()).toBe(clip);
    setClipRegionReleaseGuardSlot(null);
  });
});

describe('snapshotClipRegionUseGuard', () => {
  it('returns the guard and release state atomically', () => {
    const clip = acquireClipRegion();
    const guard = () => undefined;
    setClipRegionUseGuardSlot(guard);
    expect(snapshotClipRegionUseGuard(clip)).toEqual([guard, false]);
    releaseClipRegionToPool(clip);
    expect(snapshotClipRegionUseGuard(clip)).toEqual([guard, true]);
    expect(acquireClipRegionFromPool()).toBe(clip);
    setClipRegionUseGuardSlot(null);
  });
});
