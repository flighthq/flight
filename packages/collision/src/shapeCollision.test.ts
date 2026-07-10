import type { CollisionAabb, CollisionCircle, CollisionObb, CollisionPolygon } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createCollisionManifold } from './manifold';
import {
  testAabbAabbCollision,
  testAabbObbCollision,
  testAabbPolygonCollision,
  testCircleAabbCollision,
  testCircleCircleCollision,
  testCircleObbCollision,
  testCirclePolygonCollision,
  testObbObbCollision,
  testObbPolygonCollision,
  testPolygonPolygonCollision,
} from './shapeCollision';

// A square collider as a flat convex polygon, corners CCW from the min corner.
function square(minX: number, minY: number, size: number): CollisionPolygon {
  return { points: [minX, minY, minX + size, minY, minX + size, minY + size, minX, minY + size] };
}

describe('testAabbAabbCollision', () => {
  it('reports the least-penetration axis: boxes overlapping more on X separate along Y', () => {
    const out = createCollisionManifold();
    // A = 0..10 square; B spans x[2,8] (deep X overlap) but only y[8,10] of A (shallow Y overlap).
    const a: CollisionAabb = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b: CollisionAabb = { minX: 2, minY: 8, maxX: 8, maxY: 20 };
    expect(testAabbAabbCollision(a, b, out)).toBe(true);
    expect(out.overlapping).toBe(true);
    expect(out.normalX).toBeCloseTo(0);
    expect(out.normalY).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(2);
  });

  it('is separated when the boxes are disjoint', () => {
    const out = createCollisionManifold();
    const a: CollisionAabb = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const b: CollisionAabb = { minX: 2, minY: 2, maxX: 3, maxY: 3 };
    expect(testAabbAabbCollision(a, b, out)).toBe(false);
    expect(out.overlapping).toBe(false);
    expect(out.normalX).toBe(0);
    expect(out.normalY).toBe(0);
    expect(out.depth).toBe(0);
  });

  it('treats edge-touching as not overlapping (exclusive)', () => {
    const out = createCollisionManifold();
    const a: CollisionAabb = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const b: CollisionAabb = { minX: 1, minY: 0, maxX: 2, maxY: 1 };
    expect(testAabbAabbCollision(a, b, out)).toBe(false);
  });

  it('resolves containment with the exit-distance depth, not the intersection length', () => {
    const out = createCollisionManifold();
    // B fully inside A, closer to A's top face — MTV pushes A up through the nearest face by 5.
    const a: CollisionAabb = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b: CollisionAabb = { minX: 3, minY: 3, maxX: 6, maxY: 5 };
    expect(testAabbAabbCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(0);
    expect(out.normalY).toBeCloseTo(1);
    expect(out.depth).toBeCloseTo(5);
  });

  it('clears a reused manifold when a following pair misses', () => {
    const out = createCollisionManifold();
    testAabbAabbCollision({ minX: 0, minY: 0, maxX: 2, maxY: 2 }, { minX: 1, minY: 1, maxX: 3, maxY: 3 }, out);
    expect(out.overlapping).toBe(true);
    testAabbAabbCollision({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: 5, minY: 5, maxX: 6, maxY: 6 }, out);
    expect(out.overlapping).toBe(false);
    expect(out.normalX).toBe(0);
    expect(out.normalY).toBe(0);
    expect(out.depth).toBe(0);
  });
});

describe('testAabbObbCollision', () => {
  it('overlaps an axis-aligned OBB and pushes the box off it', () => {
    const out = createCollisionManifold();
    const a: CollisionAabb = { minX: 0, minY: 0, maxX: 4, maxY: 10 };
    const b: CollisionObb = { x: 6, y: 5, halfW: 3, halfH: 3, rotation: 0 };
    expect(testAabbObbCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.normalY).toBeCloseTo(0);
    expect(out.depth).toBeCloseTo(1); // A right edge x=4, OBB left edge x=3 -> penetration 1
  });

  it('is separated when apart', () => {
    const out = createCollisionManifold();
    const a: CollisionAabb = { minX: 0, minY: 0, maxX: 2, maxY: 2 };
    const b: CollisionObb = { x: 10, y: 10, halfW: 1, halfH: 1, rotation: 0.5 };
    expect(testAabbObbCollision(a, b, out)).toBe(false);
    expect(out.overlapping).toBe(false);
  });
});

describe('testAabbPolygonCollision', () => {
  it('overlaps a convex polygon', () => {
    const out = createCollisionManifold();
    const a: CollisionAabb = { minX: 0, minY: 0, maxX: 6, maxY: 6 };
    expect(testAabbPolygonCollision(a, square(4, 0, 6), out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(2); // A right x=6, polygon left x=4 -> penetration 2
  });

  it('is separated when apart', () => {
    const out = createCollisionManifold();
    const a: CollisionAabb = { minX: 0, minY: 0, maxX: 2, maxY: 2 };
    expect(testAabbPolygonCollision(a, square(10, 10, 4), out)).toBe(false);
  });
});

describe('testCircleAabbCollision', () => {
  it('overlaps with the closest-point normal when the center is outside the box', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 15, y: 5, radius: 7 };
    const b: CollisionAabb = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(testCircleAabbCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(1);
    expect(out.normalY).toBeCloseTo(0);
    expect(out.depth).toBeCloseTo(2); // closest point (10,5), dist 5, radius 7 -> depth 2
  });

  it('is separated when the closest point is beyond the radius', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 20, y: 5, radius: 3 };
    const b: CollisionAabb = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(testCircleAabbCollision(a, b, out)).toBe(false);
  });

  it('treats exact touching as not overlapping (exclusive)', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 17, y: 5, radius: 7 }; // closest (10,5), dist 7 == radius
    const b: CollisionAabb = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(testCircleAabbCollision(a, b, out)).toBe(false);
  });

  it('pushes out through the nearest face when the center is inside the box', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 8, y: 5, radius: 1 }; // 2 from the right face
    const b: CollisionAabb = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(testCircleAabbCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(1);
    expect(out.normalY).toBeCloseTo(0);
    expect(out.depth).toBeCloseTo(3); // 2 to the face + radius 1
  });
});

describe('testCircleCircleCollision', () => {
  it('gives depth 1 and a unit normal for two radius-1 circles centered 1 apart', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 0, y: 0, radius: 1 };
    const b: CollisionCircle = { x: 1, y: 0, radius: 1 };
    expect(testCircleCircleCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1); // pushes A (left) off B (right)
    expect(out.normalY).toBeCloseTo(0);
    expect(out.depth).toBeCloseTo(1);
  });

  it('is separated when the centers are farther than the radius sum', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 0, y: 0, radius: 1 };
    const b: CollisionCircle = { x: 3, y: 0, radius: 1 };
    expect(testCircleCircleCollision(a, b, out)).toBe(false);
    expect(out.depth).toBe(0);
  });

  it('treats exact touching (distance == radius sum) as not overlapping', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 0, y: 0, radius: 1 };
    const b: CollisionCircle = { x: 2, y: 0, radius: 1 };
    expect(testCircleCircleCollision(a, b, out)).toBe(false);
  });

  it('handles a fully contained circle', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 0, y: 0, radius: 5 };
    const b: CollisionCircle = { x: 1, y: 0, radius: 1 };
    expect(testCircleCircleCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(5); // radiusSum 6 - dist 1
  });

  it('falls back to a +X normal at full depth for concentric circles', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 2, y: 2, radius: 3 };
    const b: CollisionCircle = { x: 2, y: 2, radius: 1 };
    expect(testCircleCircleCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBe(1);
    expect(out.normalY).toBe(0);
    expect(out.depth).toBeCloseTo(4);
  });
});

describe('testCircleObbCollision', () => {
  it('matches circle-vs-AABB for a zero-rotation OBB', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 15, y: 5, radius: 7 };
    const b: CollisionObb = { x: 5, y: 5, halfW: 5, halfH: 5, rotation: 0 };
    expect(testCircleObbCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(1);
    expect(out.normalY).toBeCloseTo(0);
    expect(out.depth).toBeCloseTo(2);
  });

  it('rotates the manifold normal back into world space for a rotated OBB', () => {
    const out = createCollisionManifold();
    // OBB rotated 90 degrees: its half-width (5) lies along world Y, half-height (1) along world X.
    const a: CollisionCircle = { x: 3, y: 0, radius: 2.5 };
    const b: CollisionObb = { x: 0, y: 0, halfW: 5, halfH: 1, rotation: Math.PI / 2 };
    expect(testCircleObbCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(1); // world +X face at x=1, circle center x=3 r=2.5
    expect(out.normalY).toBeCloseTo(0);
    expect(out.depth).toBeCloseTo(0.5); // (1 + 2.5) - 3
  });

  it('is separated when apart', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 20, y: 0, radius: 1 };
    const b: CollisionObb = { x: 0, y: 0, halfW: 2, halfH: 2, rotation: 0.7 };
    expect(testCircleObbCollision(a, b, out)).toBe(false);
  });
});

describe('testCirclePolygonCollision', () => {
  it('overlaps a square polygon on the edge nearest the circle', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 13, y: 5, radius: 5 };
    expect(testCirclePolygonCollision(a, square(0, 0, 10), out)).toBe(true);
    expect(out.normalX).toBeCloseTo(1);
    expect(out.normalY).toBeCloseTo(0);
    expect(out.depth).toBeCloseTo(2); // polygon right x=10, circle left x=8 -> penetration 2
  });

  it('uses the vertex axis to separate a circle just past a corner', () => {
    const out = createCollisionManifold();
    // Corner (10,10), circle center (13,13): corner distance sqrt(18) ~= 4.243 > radius 4.
    // Edge normals alone (X and Y) would falsely report overlap; the vertex axis separates them.
    const a: CollisionCircle = { x: 13, y: 13, radius: 4 };
    expect(testCirclePolygonCollision(a, square(0, 0, 10), out)).toBe(false);
    expect(out.overlapping).toBe(false);
  });

  it('reports overlap when the circle reaches past the corner', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 13, y: 13, radius: 5 }; // corner distance 4.243 < radius 5
    expect(testCirclePolygonCollision(a, square(0, 0, 10), out)).toBe(true);
  });

  it('handles a circle fully contained in the polygon', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 5, y: 5, radius: 1 };
    expect(testCirclePolygonCollision(a, square(0, 0, 10), out)).toBe(true);
    expect(out.overlapping).toBe(true);
    expect(out.depth).toBeCloseTo(6); // 5 to the nearest edge + radius 1
  });

  it('is separated when far from the polygon', () => {
    const out = createCollisionManifold();
    const a: CollisionCircle = { x: 30, y: 5, radius: 3 };
    expect(testCirclePolygonCollision(a, square(0, 0, 10), out)).toBe(false);
  });
});

describe('testObbObbCollision', () => {
  it('overlaps an axis-aligned box with a 45-degree diamond and separates along X', () => {
    const out = createCollisionManifold();
    const a: CollisionObb = { x: 0, y: 0, halfW: 2, halfH: 2, rotation: 0 };
    const b: CollisionObb = { x: 3, y: 0, halfW: 2, halfH: 2, rotation: Math.PI / 4 };
    expect(testObbObbCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1); // pushes A (left) off the diamond
    expect(out.normalY).toBeCloseTo(0);
    expect(out.depth).toBeCloseTo(1.8284, 3); // A right x=2, diamond left vertex x=3-2.828
  });

  it('is separated when apart', () => {
    const out = createCollisionManifold();
    const a: CollisionObb = { x: 0, y: 0, halfW: 1, halfH: 1, rotation: 0.3 };
    const b: CollisionObb = { x: 8, y: 0, halfW: 1, halfH: 1, rotation: 1.1 };
    expect(testObbObbCollision(a, b, out)).toBe(false);
  });
});

describe('testObbPolygonCollision', () => {
  it('overlaps a convex polygon', () => {
    const out = createCollisionManifold();
    const a: CollisionObb = { x: 0, y: 0, halfW: 3, halfH: 3, rotation: 0 };
    expect(testObbPolygonCollision(a, square(2, -1, 4), out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(1); // OBB right x=3, polygon left x=2 -> penetration 1
  });

  it('is separated when apart', () => {
    const out = createCollisionManifold();
    const a: CollisionObb = { x: 0, y: 0, halfW: 1, halfH: 1, rotation: 0.4 };
    expect(testObbPolygonCollision(a, square(10, 10, 3), out)).toBe(false);
  });
});

describe('testPolygonPolygonCollision', () => {
  it('reports the least-penetration axis for two overlapping squares', () => {
    const out = createCollisionManifold();
    // A = 0..10 square; B overlaps deeply on X (x[2,8]) but shallowly on Y (y[8,20]).
    const a = square(0, 0, 10);
    const b: CollisionPolygon = { points: [2, 8, 8, 8, 8, 20, 2, 20] };
    expect(testPolygonPolygonCollision(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(0);
    expect(out.normalY).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(2);
  });

  it('treats a concave-looking-but-convex polygon (a regular hexagon) correctly', () => {
    const out = createCollisionManifold();
    // A convex hexagon centered near the origin.
    const hex: CollisionPolygon = { points: [2, 0, 1, 2, -1, 2, -2, 0, -1, -2, 1, -2] };
    expect(testPolygonPolygonCollision(hex, square(0, 0, 3), out)).toBe(true);
    expect(out.overlapping).toBe(true);
  });

  it('is separated when the polygons are disjoint', () => {
    const out = createCollisionManifold();
    expect(testPolygonPolygonCollision(square(0, 0, 2), square(5, 5, 2), out)).toBe(false);
  });

  it('treats edge-touching as not overlapping (exclusive)', () => {
    const out = createCollisionManifold();
    expect(testPolygonPolygonCollision(square(0, 0, 2), square(2, 0, 2), out)).toBe(false);
  });
});
