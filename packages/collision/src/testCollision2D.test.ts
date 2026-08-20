import type { CollisionShape2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createCollisionManifold2D } from './manifold';
import { setCollisionTestGuard2D, testCollision2D } from './testCollision2D';

afterEach(() => {
  setCollisionTestGuard2D(null);
});

describe('setCollisionTestGuard2D', () => {
  it('installs and removes the invalid-input diagnostics seam', () => {
    const seenKinds: string[] = [];
    const out = createCollisionManifold2D();
    const valid: CollisionShape2D = { kind: 'circle', radius: 1, x: 0, y: 0 };
    const degenerate: CollisionShape2D = { kind: 'circle', radius: 0, x: 0, y: 0 };
    setCollisionTestGuard2D((a, b) => seenKinds.push(a.kind, b.kind));
    testCollision2D(degenerate, valid, out);
    expect(seenKinds).toEqual(['circle', 'circle']);

    setCollisionTestGuard2D(null);
    testCollision2D(degenerate, valid, out);
    expect(seenKinds).toHaveLength(2);
  });
});

describe('testCollision2D', () => {
  it('dispatches a circle-circle pair to the same result as the direct test', () => {
    const out = createCollisionManifold2D();
    const a: CollisionShape2D = { kind: 'circle', x: 0, y: 0, radius: 1 };
    const b: CollisionShape2D = { kind: 'circle', x: 1, y: 0, radius: 1 };
    expect(testCollision2D(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(1);
  });

  it('dispatches an aabb-circle pair in either argument order with a sign-consistent normal', () => {
    const forward = createCollisionManifold2D();
    const reversed = createCollisionManifold2D();
    const circle: CollisionShape2D = { kind: 'circle', x: 15, y: 5, radius: 7 };
    const box: CollisionShape2D = { kind: 'aabb', minX: 0, minY: 0, maxX: 10, maxY: 10 };

    // circle vs box: pushes the circle (A) off the box -> +X.
    expect(testCollision2D(circle, box, forward)).toBe(true);
    expect(forward.normalX).toBeCloseTo(1);
    expect(forward.depth).toBeCloseTo(2);

    // box vs circle: pushes the box (A) off the circle -> the opposite direction, -X.
    expect(testCollision2D(box, circle, reversed)).toBe(true);
    expect(reversed.normalX).toBeCloseTo(-1);
    expect(reversed.depth).toBeCloseTo(2);
  });

  it('dispatches an obb-polygon pair', () => {
    const out = createCollisionManifold2D();
    const obb: CollisionShape2D = { kind: 'obb', x: 0, y: 0, halfW: 3, halfH: 3, rotation: 0 };
    const polygon: CollisionShape2D = { kind: 'polygon', points: [2, -1, 6, -1, 6, 3, 2, 3] };
    expect(testCollision2D(obb, polygon, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(1);
  });

  it('reports no overlap for disjoint shapes', () => {
    const out = createCollisionManifold2D();
    const a: CollisionShape2D = { kind: 'circle', x: 0, y: 0, radius: 1 };
    const b: CollisionShape2D = { kind: 'aabb', minX: 10, minY: 10, maxX: 12, maxY: 12 };
    expect(testCollision2D(a, b, out)).toBe(false);
    expect(out.overlapping).toBe(false);
  });

  it('reports no manifold for the area-less segment and point kinds', () => {
    const out = createCollisionManifold2D();
    const segment: CollisionShape2D = { kind: 'segment', x0: 0, y0: 0, x1: 1, y1: 1 };
    const point: CollisionShape2D = { kind: 'point', x: 0, y: 0 };
    const circle: CollisionShape2D = { kind: 'circle', x: 0, y: 0, radius: 1 };
    expect(testCollision2D(segment, circle, out)).toBe(false);
    expect(testCollision2D(circle, point, out)).toBe(false);
    expect(out.overlapping).toBe(false);
  });

  it('fully clears one reused manifold across hit, miss, unsupported, and hit calls', () => {
    const out = createCollisionManifold2D();
    const circle: CollisionShape2D = { kind: 'circle', radius: 2, x: 0, y: 0 };
    expect(testCollision2D(circle, { kind: 'circle', radius: 2, x: 1, y: 0 }, out)).toBe(true);
    expect(out).toMatchObject({ depth: 3, normalX: -1, normalY: 0, overlapping: true });

    expect(testCollision2D(circle, { kind: 'circle', radius: 2, x: 10, y: 0 }, out)).toBe(false);
    expect(out).toEqual({ depth: 0, normalX: 0, normalY: 0, overlapping: false });

    expect(testCollision2D({ kind: 'point', x: 0, y: 0 }, circle, out)).toBe(false);
    expect(out).toEqual({ depth: 0, normalX: 0, normalY: 0, overlapping: false });

    expect(testCollision2D(circle, { kind: 'aabb', maxX: 1, maxY: 1, minX: -1, minY: -1 }, out)).toBe(true);
    expect(out.overlapping).toBe(true);
    expect(out.depth).toBeGreaterThan(0);
  });
});
