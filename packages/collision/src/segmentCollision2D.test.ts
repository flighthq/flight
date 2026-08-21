import type {
  CollisionAabb2D,
  CollisionCircle2D,
  CollisionObb2D,
  CollisionPolygon2D,
  CollisionSegment2D,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  testSegmentAabbCollision2D,
  testSegmentCapsuleCollision2D,
  testSegmentCircleCollision2D,
  testSegmentObbCollision2D,
  testSegmentPolygonCollision2D,
  testSegmentSegmentCollision2D,
} from './segmentCollision2D';

function segment(x0: number, y0: number, x1: number, y1: number): CollisionSegment2D {
  return { x0, y0, x1, y1 };
}

describe('testSegmentAabbCollision2D', () => {
  const box: CollisionAabb2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('is true for a segment crossing the box', () => {
    expect(testSegmentAabbCollision2D(segment(-5, 5, 15, 5), box)).toBe(true);
  });

  it('is true for a segment fully inside the box', () => {
    expect(testSegmentAabbCollision2D(segment(2, 2, 8, 8), box)).toBe(true);
  });

  it('is false for a segment that misses the box', () => {
    expect(testSegmentAabbCollision2D(segment(-5, -5, -1, -1), box)).toBe(false);
  });

  it('is false for a segment running parallel outside the box', () => {
    expect(testSegmentAabbCollision2D(segment(-5, 20, 15, 20), box)).toBe(false);
  });

  it('treats a zero-length segment as a point', () => {
    expect(testSegmentAabbCollision2D(segment(5, 5, 5, 5), box)).toBe(true);
    expect(testSegmentAabbCollision2D(segment(20, 20, 20, 20), box)).toBe(false);
  });
});

describe('testSegmentCapsuleCollision2D', () => {
  const capsule = { x0: 0, y0: 0, x1: 4, y1: 0, radius: 1 };

  it('overlaps a segment crossing the capsule body', () => {
    expect(testSegmentCapsuleCollision2D({ x0: 2, y0: -3, x1: 2, y1: 3 }, capsule)).toBe(true);
  });

  it('overlaps a segment that only reaches a rounded end', () => {
    // Past the axis entirely, so a rectangle-only test would miss it.
    expect(testSegmentCapsuleCollision2D({ x0: 4.7, y0: -2, x1: 4.7, y1: 2 }, capsule)).toBe(true);
  });

  it('does not overlap a segment outside the rounded end', () => {
    expect(testSegmentCapsuleCollision2D({ x0: 5.2, y0: -2, x1: 5.2, y1: 2 }, capsule)).toBe(false);
  });

  it('counts a grazing touch as overlapping, like the rest of this family', () => {
    expect(testSegmentCapsuleCollision2D({ x0: -3, y0: 1, x1: 7, y1: 1 }, capsule)).toBe(true);
  });

  it('overlaps a segment lying entirely inside the capsule', () => {
    expect(testSegmentCapsuleCollision2D({ x0: 1, y0: 0, x1: 3, y1: 0 }, capsule)).toBe(true);
  });

  it('treats a zero-length capsule as the circle it degenerates to', () => {
    const point = { x0: 1, y0: 1, x1: 1, y1: 1, radius: 0.5 };
    expect(testSegmentCapsuleCollision2D({ x0: -5, y0: 1, x1: 5, y1: 1 }, point)).toBe(true);
    expect(testSegmentCapsuleCollision2D({ x0: -5, y0: 2, x1: 5, y1: 2 }, point)).toBe(false);
  });
});

describe('testSegmentCircleCollision2D', () => {
  const circle: CollisionCircle2D = { x: 0, y: 0, radius: 2 };

  it('is true for a segment passing through the circle', () => {
    expect(testSegmentCircleCollision2D(segment(-10, 0, 10, 0), circle)).toBe(true);
  });

  it('is true for a segment exactly tangent to the circle (inclusive)', () => {
    expect(testSegmentCircleCollision2D(segment(-10, 2, 10, 2), circle)).toBe(true);
  });

  it('is true when an endpoint sits inside the circle', () => {
    expect(testSegmentCircleCollision2D(segment(0, 0, 10, 0), circle)).toBe(true);
  });

  it('is false for a segment that misses the circle', () => {
    expect(testSegmentCircleCollision2D(segment(-10, 5, 10, 5), circle)).toBe(false);
  });
});

describe('testSegmentObbCollision2D', () => {
  const obb: CollisionObb2D = { x: 0, y: 0, halfW: 3, halfH: 3, rotation: Math.PI / 4 };

  it('is true for a segment crossing the rotated box', () => {
    expect(testSegmentObbCollision2D(segment(-10, 0, 10, 0), obb)).toBe(true);
  });

  it('is false for a segment above the rotated box', () => {
    expect(testSegmentObbCollision2D(segment(-10, 10, 10, 10), obb)).toBe(false);
  });
});

describe('testSegmentPolygonCollision2D', () => {
  const square: CollisionPolygon2D = { points: [0, 0, 10, 0, 10, 10, 0, 10] };

  it('is true for a segment crossing the polygon', () => {
    expect(testSegmentPolygonCollision2D(segment(-5, 5, 15, 5), square)).toBe(true);
  });

  it('is true when an endpoint is inside the polygon', () => {
    expect(testSegmentPolygonCollision2D(segment(5, 5, 20, 20), square)).toBe(true);
  });

  it('is false for a segment that misses the polygon', () => {
    expect(testSegmentPolygonCollision2D(segment(-5, -5, -1, -1), square)).toBe(false);
  });

  it('rejects a polygon with fewer than three vertices', () => {
    expect(testSegmentPolygonCollision2D(segment(0, 0, 2, 2), { points: [0, 0, 1, 1] })).toBe(false);
  });
});

describe('testSegmentSegmentCollision2D', () => {
  it('is true for two crossing segments', () => {
    expect(testSegmentSegmentCollision2D(segment(0, 0, 10, 10), segment(0, 10, 10, 0))).toBe(true);
  });

  it('is true for segments touching at a shared endpoint (inclusive)', () => {
    expect(testSegmentSegmentCollision2D(segment(0, 0, 5, 0), segment(5, 0, 5, 5))).toBe(true);
  });

  it('is true for overlapping collinear segments', () => {
    expect(testSegmentSegmentCollision2D(segment(0, 0, 10, 0), segment(5, 0, 15, 0))).toBe(true);
  });

  it('is false for disjoint collinear segments', () => {
    expect(testSegmentSegmentCollision2D(segment(0, 0, 4, 0), segment(6, 0, 10, 0))).toBe(false);
  });

  it('is false for parallel non-collinear segments', () => {
    expect(testSegmentSegmentCollision2D(segment(0, 0, 10, 0), segment(0, 1, 10, 1))).toBe(false);
  });

  it('is false for segments that miss each other', () => {
    expect(testSegmentSegmentCollision2D(segment(0, 0, 1, 0), segment(5, 5, 6, 6))).toBe(false);
  });

  it('handles zero-length segments as point queries', () => {
    expect(testSegmentSegmentCollision2D(segment(5, 0, 5, 0), segment(0, 0, 10, 0))).toBe(true);
    expect(testSegmentSegmentCollision2D(segment(5, 1, 5, 1), segment(0, 0, 10, 0))).toBe(false);
    expect(testSegmentSegmentCollision2D(segment(2, 3, 2, 3), segment(2, 3, 2, 3))).toBe(true);
    expect(testSegmentSegmentCollision2D(segment(2, 3, 2, 3), segment(2, 4, 2, 4))).toBe(false);
  });

  it('does not collapse proportionally tiny parallel segments onto one line', () => {
    expect(testSegmentSegmentCollision2D(segment(0, 0, 1e-6, 0), segment(0, 1e-7, 1e-6, 1e-7))).toBe(false);
  });
});
