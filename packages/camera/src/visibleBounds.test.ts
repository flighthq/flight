import { createRectangle, createVector2 } from '@flighthq/geometry';
import { describe, expect, it } from 'vitest';

import { createCamera2D } from './camera2d';
import { unprojectCamera2DPoint } from './projection2d';
import { getCamera2DVisibleBounds } from './visibleBounds';

describe('getCamera2DVisibleBounds', () => {
  it('covers the full viewport in world units at zoom 1', () => {
    const camera = createCamera2D(800, 600);
    const out = createRectangle();
    getCamera2DVisibleBounds(camera, out);
    expect(out.x).toBeCloseTo(-400, 9);
    expect(out.y).toBeCloseTo(-300, 9);
    expect(out.width).toBeCloseTo(800, 9);
    expect(out.height).toBeCloseTo(600, 9);
  });

  it('shrinks to half size centered at zoom 2', () => {
    const camera = createCamera2D(800, 600, { zoom: 2 });
    const out = createRectangle();
    getCamera2DVisibleBounds(camera, out);
    expect(out.x).toBeCloseTo(-200, 9);
    expect(out.y).toBeCloseTo(-150, 9);
    expect(out.width).toBeCloseTo(400, 9);
    expect(out.height).toBeCloseTo(300, 9);
  });

  it('returns the enclosing AABB of a rotated view, larger than the viewport', () => {
    const camera = createCamera2D(800, 600, { rotation: Math.PI / 4 });
    const out = createRectangle();
    getCamera2DVisibleBounds(camera, out);
    // AABB of an 800x600 rect rotated 45deg: both extents = (800 + 600) * cos(45deg).
    expect(out.width).toBeCloseTo(989.9494936611666, 6);
    expect(out.height).toBeCloseTo(989.9494936611666, 6);
    expect(out.width).toBeGreaterThan(800);
    expect(out.height).toBeGreaterThan(600);
    // The AABB encloses every unprojected screen corner.
    const corner = createVector2();
    const corners: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [800, 0],
      [800, 600],
      [0, 600],
    ];
    for (const [sx, sy] of corners) {
      unprojectCamera2DPoint(camera, sx, sy, corner);
      expect(corner.x).toBeGreaterThanOrEqual(out.x - 1e-6);
      expect(corner.x).toBeLessThanOrEqual(out.x + out.width + 1e-6);
      expect(corner.y).toBeGreaterThanOrEqual(out.y - 1e-6);
      expect(corner.y).toBeLessThanOrEqual(out.y + out.height + 1e-6);
    }
  });
});
