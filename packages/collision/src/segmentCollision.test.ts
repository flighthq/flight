import type { CollisionAabb, CollisionCircle, CollisionObb, CollisionPolygon, CollisionSegment } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  testSegmentAabbCollision,
  testSegmentCircleCollision,
  testSegmentObbCollision,
  testSegmentPolygonCollision,
  testSegmentSegmentCollision,
} from './segmentCollision';

function segment(x0: number, y0: number, x1: number, y1: number): CollisionSegment {
  return { x0, y0, x1, y1 };
}

describe('testSegmentAabbCollision', () => {
  const box: CollisionAabb = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

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
});

describe('testSegmentCircleCollision', () => {
  const circle: CollisionCircle = { x: 0, y: 0, radius: 2 };

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
  const obb: CollisionObb = { x: 0, y: 0, halfW: 3, halfH: 3, rotation: Math.PI / 4 };

  it('is true for a segment crossing the rotated box', () => {
    expect(testSegmentObbCollision(segment(-10, 0, 10, 0), obb)).toBe(true);
  });

  it('is false for a segment above the rotated box', () => {
    expect(testSegmentObbCollision(segment(-10, 10, 10, 10), obb)).toBe(false);
  });
});

describe('testSegmentPolygonCollision', () => {
  const square: CollisionPolygon = { points: [0, 0, 10, 0, 10, 10, 0, 10] };

  it('is true for a segment crossing the polygon', () => {
    expect(testSegmentPolygonCollision(segment(-5, 5, 15, 5), square)).toBe(true);
  });

  it('is true when an endpoint is inside the polygon', () => {
    expect(testSegmentPolygonCollision(segment(5, 5, 20, 20), square)).toBe(true);
  });

  it('is false for a segment that misses the polygon', () => {
    expect(testSegmentPolygonCollision(segment(-5, -5, -1, -1), square)).toBe(false);
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
});
