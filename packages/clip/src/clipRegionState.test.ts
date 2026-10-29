import { describe, expect, it } from 'vitest';

import { clipRegionStateStateStore } from './clipRegionRuntime.ts';
import { getClipRegionStateBinding } from './clipRegionState.ts';

describe('getClipRegionStateBinding', () => {
  it('returns one lazy private entity binding', () => {
    const binding = getClipRegionStateBinding();
    expect(getClipRegionStateBinding()).toBe(binding);
    expect(Object.keys(binding)).toEqual([]);
    expect(clipRegionStateStateStore.has(binding)).toBe(true);
  });
});
