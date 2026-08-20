import type {
  CollisionAabb2D,
  CollisionCircle2D,
  CollisionObb2D,
  CollisionPolygon2D,
  CollisionSegment2D,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  testSegmentAabbCollision,
  testSegmentCircleCollision,
  testSegmentObbCollision,
  testSegmentPolygonCollision,
  testSegmentSegmentCollision,
} from './segmentCollision';

function segment(x0: number, y0: number, x1: number, y1: number): CollisionSegment2D {
  return { x0, y0, x1, y1 };
}

describe('testSegmentAabbCollision', () => {
  const box: CollisionAabb2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('is true for a segment crossing the box', () => {
    expect(testSegmentAabbCollision(segment(-5, 5, 15, 5), box)).toBe(true);
  });

  it('is true for a segment fully inside the box', () => {
    expect(testSegmentAabbCollision(segment(2, 2, 8, 8), box)).toBe(true);
  });

  it('is false for a segment that misses the box', () => {
    expect(testSegmentAabbCollision(segment(-5, -5, -1, -1), box)).toBe(false);
  });

  it('is false for a segment running parallel outside the box', () => {
    expect(testSegmentAabbCollision(segment(-5, 20, 15, 20), box)).toBe(false);
  });

  it('treats a zero-length segment as a point', () => {
    expect(testSegmentAabbCollision(segment(5, 5, 5, 5), box)).toBe(true);
    expect(testSegmentAabbCollision(segment(20, 20, 20, 20), box)).toBe(false);
  });
});

describe('testSegmentCircleCollision', () => {
  const circle: CollisionCircle2D = { x: 0, y: 0, radius: 2 };

  it('is true for a segment passing through the circle', () => {
    expect(testSegmentCircleCollision(segment(-10, 0, 10, 0), circle)).toBe(true);
  });

  it('is true for a segment exactly tangent to the circle (inclusive)', () => {
    expect(testSegmentCircleCollision(segment(-10, 2, 10, 2), circle)).toBe(true);
  });

  it('is true when an endpoint sits inside the circle', () => {
    expect(testSegmentCircleCollision(segment(0, 0, 10, 0), circle)).toBe(true);
  });

  it('is false for a segment that misses the circle', () => {
    expect(testSegmentCircleCollision(segment(-10, 5, 10, 5), circle)).toBe(false);
  });
});

describe('testSegmentObbCollision', () => {
  const obb: CollisionObb2D = { x: 0, y: 0, halfW: 3, halfH: 3, rotation: Math.PI / 4 };

  it('is true for a segment crossing the rotated box', () => {
    expect(testSegmentObbCollision(segment(-10, 0, 10, 0), obb)).toBe(true);
  });

  it('is false for a segment above the rotated box', () => {
    expect(testSegmentObbCollision(segment(-10, 10, 10, 10), obb)).toBe(false);
  });
});

describe('testSegmentPolygonCollision', () => {
  const square: CollisionPolygon2D = { points: [0, 0, 10, 0, 10, 10, 0, 10] };

  it('is true for a segment crossing the polygon', () => {
    expect(testSegmentPolygonCollision(segment(-5, 5, 15, 5), square)).toBe(true);
  });

  it('is true when an endpoint is inside the polygon', () => {
    expect(testSegmentPolygonCollision(segment(5, 5, 20, 20), square)).toBe(true);
  });

  it('is false for a segment that misses the polygon', () => {
    expect(testSegmentPolygonCollision(segment(-5, -5, -1, -1), square)).toBe(false);
  });

  it('rejects a polygon with fewer than three vertices', () => {
    expect(testSegmentPolygonCollision(segment(0, 0, 2, 2), { points: [0, 0, 1, 1] })).toBe(false);
  });
});

describe('testSegmentSegmentCollision', () => {
  it('is true for two crossing segments', () => {
    expect(testSegmentSegmentCollision(segment(0, 0, 10, 10), segment(0, 10, 10, 0))).toBe(true);
  });

  it('is true for segments touching at a shared endpoint (inclusive)', () => {
    expect(testSegmentSegmentCollision(segment(0, 0, 5, 0), segment(5, 0, 5, 5))).toBe(true);
  });

  it('is true for overlapping collinear segments', () => {
    expect(testSegmentSegmentCollision(segment(0, 0, 10, 0), segment(5, 0, 15, 0))).toBe(true);
  });

  it('is false for disjoint collinear segments', () => {
    expect(testSegmentSegmentCollision(segment(0, 0, 4, 0), segment(6, 0, 10, 0))).toBe(false);
  });

  it('is false for parallel non-collinear segments', () => {
    expect(testSegmentSegmentCollision(segment(0, 0, 10, 0), segment(0, 1, 10, 1))).toBe(false);
  });

  it('is false for segments that miss each other', () => {
    expect(testSegmentSegmentCollision(segment(0, 0, 1, 0), segment(5, 5, 6, 6))).toBe(false);
  });

  it('handles zero-length segments as point queries', () => {
    expect(testSegmentSegmentCollision(segment(5, 0, 5, 0), segment(0, 0, 10, 0))).toBe(true);
    expect(testSegmentSegmentCollision(segment(5, 1, 5, 1), segment(0, 0, 10, 0))).toBe(false);
    expect(testSegmentSegmentCollision(segment(2, 3, 2, 3), segment(2, 3, 2, 3))).toBe(true);
    expect(testSegmentSegmentCollision(segment(2, 3, 2, 3), segment(2, 4, 2, 4))).toBe(false);
  });

  it('does not collapse proportionally tiny parallel segments onto one line', () => {
    expect(testSegmentSegmentCollision(segment(0, 0, 1e-6, 0), segment(0, 1e-7, 1e-6, 1e-7))).toBe(false);
  });
});
