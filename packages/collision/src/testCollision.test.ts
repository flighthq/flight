import type { CollisionShape } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createCollisionManifold } from './manifold';
import { testCollision } from './testCollision';

describe('testCollision', () => {
  it('dispatches a circle-circle pair to the same result as the direct test', () => {
    const out = createCollisionManifold();
    const a: CollisionShape = { kind: 'circle', x: 0, y: 0, radius: 1 };
    const b: CollisionShape = { kind: 'circle', x: 1, y: 0, radius: 1 };
    expect(testCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(1);
  });

  it('dispatches an aabb-circle pair in either argument order with a sign-consistent normal', () => {
    const forward = createCollisionManifold();
    const reversed = createCollisionManifold();
    const circle: CollisionShape = { kind: 'circle', x: 15, y: 5, radius: 7 };
    const box: CollisionShape = { kind: 'aabb', minX: 0, minY: 0, maxX: 10, maxY: 10 };

    // circle vs box: pushes the circle (A) off the box -> +X.
    expect(testCollision(circle, box, forward)).toBe(true);
    expect(forward.normalX).toBeCloseTo(1);
    expect(forward.depth).toBeCloseTo(2);

    // box vs circle: pushes the box (A) off the circle -> the opposite direction, -X.
    expect(testCollision(box, circle, reversed)).toBe(true);
    expect(reversed.normalX).toBeCloseTo(-1);
    expect(reversed.depth).toBeCloseTo(2);
  });

  it('dispatches an obb-polygon pair', () => {
    const out = createCollisionManifold();
    const obb: CollisionShape = { kind: 'obb', x: 0, y: 0, halfW: 3, halfH: 3, rotation: 0 };
    const polygon: CollisionShape = { kind: 'polygon', points: [2, -1, 6, -1, 6, 3, 2, 3] };
    expect(testCollision(obb, polygon, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(1);
  });

  it('reports no overlap for disjoint shapes', () => {
    const out = createCollisionManifold();
    const a: CollisionShape = { kind: 'circle', x: 0, y: 0, radius: 1 };
    const b: CollisionShape = { kind: 'aabb', minX: 10, minY: 10, maxX: 12, maxY: 12 };
    expect(testCollision(a, b, out)).toBe(false);
    expect(out.overlapping).toBe(false);
  });

  it('reports no manifold for the area-less segment and point kinds', () => {
    const out = createCollisionManifold();
    const segment: CollisionShape = { kind: 'segment', x0: 0, y0: 0, x1: 1, y1: 1 };
    const point: CollisionShape = { kind: 'point', x: 0, y: 0 };
    const circle: CollisionShape = { kind: 'circle', x: 0, y: 0, radius: 1 };
    expect(testCollision(segment, circle, out)).toBe(false);
    expect(testCollision(circle, point, out)).toBe(false);
    expect(out.overlapping).toBe(false);
  });
});
