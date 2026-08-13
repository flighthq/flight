import { createRectangle, createVector2, intersectsRectangle } from '@flighthq/geometry/contract';
import { describe, expect, it, test } from 'vitest';

import { createCamera2D } from './camera2d';
import { unprojectCamera2DPoint } from './projection2d';
import { getCamera2DVisibleBounds, setCamera2DVisibleBoundsGuard } from './visibleBounds';

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

describe('setCamera2DVisibleBoundsGuard', () => {
  test('fails toward drawing: an unbounded rectangle that still intersects distant content', () => {
    const out = createRectangle();
    getCamera2DVisibleBounds(createCamera2D(64, 64, { zoom: 0 }), out);
    // Finite on purpose — the max edge must survive ordinary arithmetic, not rely on NaN comparisons.
    expect(Number.isFinite(out.x + out.width)).toBe(true);
    expect(Number.isFinite(out.y + out.height)).toBe(true);
    // The property that matters is behavioural, not the constant: nothing gets culled.
    expect(intersectsRectangle(out, createRectangle(1e12, -4e11, 10, 10))).toBe(true);
    expect(intersectsRectangle(out, createRectangle(-9e15, 8e14, 1, 1))).toBe(true);
  });

  test('notifies the installed guard exactly once per degenerate call, and never for an invertible camera', () => {
    const seen: number[] = [];
    setCamera2DVisibleBoundsGuard((camera) => seen.push(camera.zoom));
    try {
      getCamera2DVisibleBounds(createCamera2D(64, 64, { zoom: 0 }), createRectangle());
      getCamera2DVisibleBounds(createCamera2D(64, 64), createRectangle());
      expect(seen).toEqual([0]);
    } finally {
      setCamera2DVisibleBoundsGuard(null);
    }
  });

  test('leaves an invertible camera computing the same bounds as before', () => {
    const out = createRectangle();
    getCamera2DVisibleBounds(createCamera2D(64, 32), out);
    expect(out.width).toBeCloseTo(64, 6);
    expect(out.height).toBeCloseTo(32, 6);
  });
});
