import { createRectangle } from '@flighthq/geometry';
import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';

import { createClipRegionFromPath, createClipRegionFromRectangle, invalidateClipRegion } from './clipRegion';

describe('createClipRegionFromPath', () => {
  it('flattens to contours and bounds the region by their extent', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 10, 10);
    appendPathLineTo(path, 0, 10);
    const clip = createClipRegionFromPath(path);
    expect(clip.contours).not.toBeNull();
    expect(clip.rect.x).toBeCloseTo(0);
    expect(clip.rect.y).toBeCloseTo(0);
    expect(clip.rect.width).toBeCloseTo(10);
    expect(clip.rect.height).toBeCloseTo(10);
    expect(clip.version).toBe(0);
  });
});

describe('createClipRegionFromRectangle', () => {
  it('copies the rectangle, leaves contours null, and starts at version 0', () => {
    const rectangle = createRectangle(5, 6, 20, 30);
    const clip = createClipRegionFromRectangle(rectangle);
    expect(clip.contours).toBeNull();
    expect(clip.rect).not.toBe(rectangle);
    expect(clip.rect.x).toBe(5);
    expect(clip.rect.y).toBe(6);
    expect(clip.rect.width).toBe(20);
    expect(clip.rect.height).toBe(30);
    expect(clip.version).toBe(0);
  });
});

describe('invalidateClipRegion', () => {
  it('increments the version and wraps with >>> 0', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    invalidateClipRegion(clip);
    expect(clip.version).toBe(1);
    clip.version = 0xffffffff;
    invalidateClipRegion(clip);
    expect(clip.version).toBe(0);
  });
});
