import type { CollisionShape } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { getCollisionShapeContainsPoint } from './pointContainment';

describe('getCollisionShapeContainsPoint', () => {
  it('tests a circle inside, outside, and on the boundary (inclusive)', () => {
    const circle: CollisionShape = { kind: 'circle', x: 0, y: 0, radius: 5 };
    expect(getCollisionShapeContainsPoint(circle, 1, 1)).toBe(true);
    expect(getCollisionShapeContainsPoint(circle, 5, 0)).toBe(true); // on the boundary
    expect(getCollisionShapeContainsPoint(circle, 6, 0)).toBe(false);
  });

  it('tests an axis-aligned box, boundary-inclusive', () => {
    const box: CollisionShape = { kind: 'aabb', minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(getCollisionShapeContainsPoint(box, 5, 5)).toBe(true);
    expect(getCollisionShapeContainsPoint(box, 0, 10)).toBe(true); // corner
    expect(getCollisionShapeContainsPoint(box, -1, 5)).toBe(false);
    expect(getCollisionShapeContainsPoint(box, 11, 5)).toBe(false);
  });

  it('tests a rotated oriented box in its own frame', () => {
    // 45-degree box, half-extents 2x2. A point on the world axis at distance 2.8 is inside
    // (the box reaches ~2.83 along its diagonal) but the same distance is outside a smaller reach.
    const obb: CollisionShape = { kind: 'obb', x: 0, y: 0, halfW: 2, halfH: 2, rotation: Math.PI / 4 };
    expect(getCollisionShapeContainsPoint(obb, 0, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint(obb, 2.8, 0)).toBe(true); // toward a rotated corner
    expect(getCollisionShapeContainsPoint(obb, 2.1, 2.1)).toBe(false); // just past a flat edge
  });

  it('tests a convex hexagon inside and outside', () => {
    const hex: CollisionShape = { kind: 'polygon', points: [2, 0, 1, 2, -1, 2, -2, 0, -1, -2, 1, -2] };
    expect(getCollisionShapeContainsPoint(hex, 0, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint(hex, 1.9, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint(hex, 3, 0)).toBe(false);
    expect(getCollisionShapeContainsPoint(hex, 0, 3)).toBe(false);
  });

  it('tests a point lying on a segment', () => {
    const segment: CollisionShape = { kind: 'segment', x0: 0, y0: 0, x1: 10, y1: 0 };
    expect(getCollisionShapeContainsPoint(segment, 5, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint(segment, 5, 0.1)).toBe(false);
    expect(getCollisionShapeContainsPoint(segment, 11, 0)).toBe(false);
  });

  it('tests coincidence with a point collider', () => {
    const point: CollisionShape = { kind: 'point', x: 3, y: 4 };
    expect(getCollisionShapeContainsPoint(point, 3, 4)).toBe(true);
    expect(getCollisionShapeContainsPoint(point, 3, 5)).toBe(false);
  });

  it('returns false for an unknown kind', () => {
    const shape = { kind: 'acme.capsule', x: 0, y: 0 } as unknown as CollisionShape;
    expect(getCollisionShapeContainsPoint(shape, 0, 0)).toBe(false);
  });
});
