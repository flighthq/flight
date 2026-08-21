import type { CollisionBuiltInShape2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { getCollisionShapeContainsPoint2D } from './pointContainment2D';

describe('getCollisionShapeContainsPoint2D', () => {
  it('tests a circle inside, outside, and on the boundary (inclusive)', () => {
    const circle: CollisionBuiltInShape2D = { kind: 'circle', x: 0, y: 0, radius: 5 };
    expect(getCollisionShapeContainsPoint2D(circle, 1, 1)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(circle, 5, 0)).toBe(true); // on the boundary
    expect(getCollisionShapeContainsPoint2D(circle, 6, 0)).toBe(false);
  });

  it('tests an axis-aligned box, boundary-inclusive', () => {
    const box: CollisionBuiltInShape2D = { kind: 'aabb', minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(getCollisionShapeContainsPoint2D(box, 5, 5)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(box, 0, 10)).toBe(true); // corner
    expect(getCollisionShapeContainsPoint2D(box, -1, 5)).toBe(false);
    expect(getCollisionShapeContainsPoint2D(box, 11, 5)).toBe(false);
  });

  it('tests a rotated oriented box in its own frame', () => {
    // 45-degree box, half-extents 2x2. A point on the world axis at distance 2.8 is inside
    // (the box reaches ~2.83 along its diagonal) but the same distance is outside a smaller reach.
    const obb: CollisionBuiltInShape2D = { kind: 'obb', x: 0, y: 0, halfW: 2, halfH: 2, rotation: Math.PI / 4 };
    expect(getCollisionShapeContainsPoint2D(obb, 0, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(obb, 2.8, 0)).toBe(true); // toward a rotated corner
    expect(getCollisionShapeContainsPoint2D(obb, 2.1, 2.1)).toBe(false); // just past a flat edge
  });

  it('tests a convex hexagon inside and outside', () => {
    const hex: CollisionBuiltInShape2D = { kind: 'polygon', points: [2, 0, 1, 2, -1, 2, -2, 0, -1, -2, 1, -2] };
    expect(getCollisionShapeContainsPoint2D(hex, 0, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(hex, 1.9, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(hex, 3, 0)).toBe(false);
    expect(getCollisionShapeContainsPoint2D(hex, 0, 3)).toBe(false);
  });

  it('rejects polygons with fewer than three vertices', () => {
    const polygon: CollisionBuiltInShape2D = { kind: 'polygon', points: [0, 0, 1, 1] };
    expect(getCollisionShapeContainsPoint2D(polygon, 0.5, 0.5)).toBe(false);
  });

  it('keeps containment proportional for a tiny polygon', () => {
    const polygon: CollisionBuiltInShape2D = {
      kind: 'polygon',
      points: [0, 0, 1e-6, 0, 1e-6, 1e-6, 0, 1e-6],
    };
    expect(getCollisionShapeContainsPoint2D(polygon, 0.5e-6, 0.5e-6)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(polygon, 2e-6, 0.5e-6)).toBe(false);
  });

  it('tests a point lying on a segment', () => {
    const segment: CollisionBuiltInShape2D = { kind: 'segment', x0: 0, y0: 0, x1: 10, y1: 0 };
    expect(getCollisionShapeContainsPoint2D(segment, 5, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(segment, 5, 0.1)).toBe(false);
    expect(getCollisionShapeContainsPoint2D(segment, 11, 0)).toBe(false);
  });

  it('tests coincidence with a point collider', () => {
    const point: CollisionBuiltInShape2D = { kind: 'point', x: 3, y: 4 };
    expect(getCollisionShapeContainsPoint2D(point, 3, 4)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(point, 3, 5)).toBe(false);
  });

  it('treats zero-radius circles and zero-length segments as point-like', () => {
    const circle: CollisionBuiltInShape2D = { kind: 'circle', radius: 0, x: 3, y: 4 };
    const segment: CollisionBuiltInShape2D = { kind: 'segment', x0: 3, x1: 3, y0: 4, y1: 4 };
    expect(getCollisionShapeContainsPoint2D(circle, 3, 4)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(circle, 3, 4.001)).toBe(false);
    expect(getCollisionShapeContainsPoint2D(segment, 3, 4)).toBe(true);
    expect(getCollisionShapeContainsPoint2D(segment, 3, 4.001)).toBe(false);
  });

  it('returns false for an unknown kind', () => {
    // The double cast is the test: a vendor kind is a COMPILE error at this signature now, because
    // containment has no registry to answer one with. What is asserted here is the residual runtime
    // behaviour for callers who reach it anyway — untyped JavaScript, or a cast like this one — which
    // must still be the `false` sentinel rather than a crash reading fields that are not there.
    const shape = { kind: 'acme.capsule', x: 0, y: 0 } as unknown as CollisionBuiltInShape2D;
    expect(getCollisionShapeContainsPoint2D(shape, 0, 0)).toBe(false);
  });
});
