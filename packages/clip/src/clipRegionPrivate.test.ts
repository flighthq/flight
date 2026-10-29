import { createRectangle } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import { clipRegionStateStateStore } from './clipRegionRuntime.ts';
import { getClipRegionStateBinding } from './clipRegionState.ts';
import { createClipRegionFromRectangle } from './contract.ts';

describe('ClipRegion private runtime state', () => {
  it('keeps the lazy module binding and runtime aggregate off public objects', () => {
    const binding = getClipRegionStateBinding();
    const clip = createClipRegionFromRectangle(createRectangle(1, 2, 3, 4));

    expect(getClipRegionStateBinding()).toBe(binding);
    expect(clipRegionStateStateStore.has(binding)).toBe(true);
    expect(Object.keys(binding)).toEqual([]);
    expect(Object.keys(clip).sort()).toEqual(['contours', 'rect', 'version', 'winding']);

    for (const privateName of ['state', 'runtime', 'pool', 'poolSize', 'contoursGuard', 'releaseGuard', 'useGuard']) {
      expect(binding).not.toHaveProperty(privateName);
      expect(clip).not.toHaveProperty(privateName);
    }
  });
});
