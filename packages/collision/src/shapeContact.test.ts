import type { CollisionAabb, CollisionCircle, CollisionObb, CollisionPolygon } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createCollisionContactManifold } from './contactManifold';
import { createCollisionManifold } from './manifold';
import {
  testAabbAabbCollision,
  testCircleCircleCollision,
  testObbObbCollision,
  testPolygonPolygonCollision,
} from './shapeCollision';
import {
  collideAabbAabbContactManifold,
  collideAabbObbContactManifold,
  collideAabbPolygonContactManifold,
  collideCircleAabbContactManifold,
  collideCircleCircleContactManifold,
  collideCircleObbContactManifold,
  collideCirclePolygonContactManifold,
  collideObbObbContactManifold,
  collideObbPolygonContactManifold,
  collidePolygonPolygonContactManifold,
} from './shapeContact';

// A wide, shallow ground slab every resting-contact case sits on.
const ground: CollisionAabb = { minX: -5, minY: -1, maxX: 5, maxY: 0 };

// A square collider as a flat convex polygon, corners counter-clockwise from the min corner.
function square(minX: number, minY: number, size: number): CollisionPolygon {
  return { points: [minX, minY, minX + size, minY, minX + size, minY + size, minX, minY + size] };
}

// The contact points that are actually valid this call, in order. Reading past `pointCount` is
// outside the contract, so every assertion goes through this.
function livePoints(manifold: ReturnType<typeof createCollisionContactManifold>) {
  return manifold.points.slice(0, manifold.pointCount);
}

describe('collideAabbAabbContactManifold', () => {
  it('resolves a box resting on the ground to two points spanning the overlap', () => {
    const out = createCollisionContactManifold();
    // The box's underside dips 0.1 below the ground's top face across x[0,2].
    const box: CollisionAabb = { minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 };
    expect(collideAabbAabbContactManifold(box, ground, out)).toBe(true);
    expect(out.overlapping).toBe(true);
    expect(out.normalX).toBeCloseTo(0);
    expect(out.normalY).toBeCloseTo(1);
    expect(out.depth).toBeCloseTo(0.1);

    // Two points is what makes this a rigid-body contact rather than a push-out vector: a single
    // point has no torque arm and the box could not stay level.
    expect(out.pointCount).toBe(2);
    const xs = livePoints(out)
      .map((point) => point.x)
      .sort((left, right) => left - right);
    expect(xs[0]).toBeCloseTo(0);
    expect(xs[1]).toBeCloseTo(2);
    for (const point of livePoints(out)) {
      expect(point.y).toBeCloseTo(0);
      expect(point.depth).toBeCloseTo(0.1);
    }
  });

  it('gives the two points distinct feature ids that survive the box sliding along the ground', () => {
    const first = createCollisionContactManifold();
    const second = createCollisionContactManifold();
    expect(collideAabbAabbContactManifold({ minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 }, ground, first)).toBe(true);
    expect(collideAabbAabbContactManifold({ minX: 0.3, minY: -0.12, maxX: 2.3, maxY: 1.88 }, ground, second)).toBe(
      true,
    );

    expect(first.points[0].featureId).not.toBe(first.points[1].featureId);
    // Same faces still in contact, so the ids must match for the solver's warm start to apply.
    expect(second.points[0].featureId).toBe(first.points[0].featureId);
    expect(second.points[1].featureId).toBe(first.points[1].featureId);
  });

  it('agrees with the lean overlap test on normal and depth', () => {
    const contact = createCollisionContactManifold();
    const lean = createCollisionManifold();
    const a: CollisionAabb = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b: CollisionAabb = { minX: 2, minY: 8, maxX: 8, maxY: 20 };
    expect(collideAabbAabbContactManifold(a, b, contact)).toBe(true);
    expect(testAabbAabbCollision(a, b, lean)).toBe(true);
    expect(contact.normalX).toBeCloseTo(lean.normalX);
    expect(contact.normalY).toBeCloseTo(lean.normalY);
    expect(contact.depth).toBeCloseTo(lean.depth);
  });

  it('negates the normal and moves the points to the opposite surface when the arguments are reversed', () => {
    // Two boxes tie exactly on separation, so the reference face resolves toward the first argument and
    // the contact points lie on whichever surface that picks. Reversing therefore keeps the contact span
    // (same xs) and the pair-level answer (normal negated, depth equal) while moving the points one
    // penetration depth down, onto the other body's face. Both are correct contacts; which one you get
    // is the caller's argument order, and this pins that rather than averting its eyes from it.
    const forward = createCollisionContactManifold();
    const reversed = createCollisionContactManifold();
    const box: CollisionAabb = { minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 };
    expect(collideAabbAabbContactManifold(box, ground, forward)).toBe(true);
    expect(collideAabbAabbContactManifold(ground, box, reversed)).toBe(true);

    expect(reversed.normalX).toBeCloseTo(-forward.normalX);
    expect(reversed.normalY).toBeCloseTo(-forward.normalY);
    expect(reversed.depth).toBeCloseTo(forward.depth);
    expect(reversed.pointCount).toBe(forward.pointCount);
    const forwardXs = livePoints(forward)
      .map((point) => point.x)
      .sort((left, right) => left - right);
    const reversedXs = livePoints(reversed)
      .map((point) => point.x)
      .sort((left, right) => left - right);
    expect(reversedXs[0]).toBeCloseTo(forwardXs[0]);
    expect(reversedXs[1]).toBeCloseTo(forwardXs[1]);
    for (const point of livePoints(forward)) expect(point.y).toBeCloseTo(0);
    for (const point of livePoints(reversed)) expect(point.y).toBeCloseTo(-0.1);
  });

  it('clears the manifold on a miss, so no stale point is left readable', () => {
    const out = createCollisionContactManifold();
    expect(collideAabbAabbContactManifold({ minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 }, ground, out)).toBe(true);
    expect(out.pointCount).toBe(2);

    expect(collideAabbAabbContactManifold({ minX: 0, minY: 5, maxX: 2, maxY: 7 }, ground, out)).toBe(false);
    expect(out.overlapping).toBe(false);
    expect(out.pointCount).toBe(0);
    expect(out.depth).toBe(0);
  });

  it('treats exactly touching boxes as not overlapping, matching the lean test', () => {
    const out = createCollisionContactManifold();
    expect(collideAabbAabbContactManifold({ minX: 0, minY: 0, maxX: 2, maxY: 2 }, ground, out)).toBe(false);
    expect(out.pointCount).toBe(0);
  });
});

describe('collideAabbObbContactManifold', () => {
  it('resolves a flat-lying oriented box under a box to a two-point face contact', () => {
    const out = createCollisionContactManifold();
    const box: CollisionAabb = { minX: -1, minY: -0.1, maxX: 1, maxY: 2 };
    const platform: CollisionObb = { x: 0, y: -1, halfW: 3, halfH: 1, rotation: 0 };
    expect(collideAabbObbContactManifold(box, platform, out)).toBe(true);
    expect(out.normalY).toBeCloseTo(1);
    expect(out.depth).toBeCloseTo(0.1);
    expect(out.pointCount).toBe(2);
    for (const point of livePoints(out)) {
      expect(point.y).toBeCloseTo(0);
    }
  });

  it('resolves a corner-first oriented box to a single deepest point', () => {
    const out = createCollisionContactManifold();
    const half = Math.SQRT2 / 2;
    // A unit-ish diamond whose lowest corner just dips under the box's top face.
    const diamond: CollisionObb = { x: 0, y: 1 + half - 0.05, halfW: 0.5, halfH: 0.5, rotation: Math.PI / 4 };
    const box: CollisionAabb = { minX: -3, minY: -1, maxX: 3, maxY: 1 };
    expect(collideAabbObbContactManifold(box, diamond, out)).toBe(true);
    expect(out.pointCount).toBe(1);
    expect(out.points[0].x).toBeCloseTo(0);
    expect(out.points[0].y).toBeCloseTo(1 - 0.05);
    expect(out.points[0].depth).toBeCloseTo(0.05);
  });

  it('is separated when the boxes are disjoint', () => {
    const out = createCollisionContactManifold();
    expect(
      collideAabbObbContactManifold(
        { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        { x: 9, y: 9, halfW: 1, halfH: 1, rotation: 0.3 },
        out,
      ),
    ).toBe(false);
    expect(out.pointCount).toBe(0);
  });
});

describe('collideAabbPolygonContactManifold', () => {
  it('matches the all-polygon result for the same geometry', () => {
    const viaAabb = createCollisionContactManifold();
    const viaPolygon = createCollisionContactManifold();
    const box: CollisionAabb = { minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 };
    // The ground slab restated as a polygon, so both routes see identical geometry.
    const slab: CollisionPolygon = { points: [-5, -1, 5, -1, 5, 0, -5, 0] };
    expect(collideAabbPolygonContactManifold(box, slab, viaAabb)).toBe(true);
    expect(collidePolygonPolygonContactManifold(square(0, -0.1, 2), slab, viaPolygon)).toBe(true);

    expect(viaAabb.normalX).toBeCloseTo(viaPolygon.normalX);
    expect(viaAabb.normalY).toBeCloseTo(viaPolygon.normalY);
    expect(viaAabb.depth).toBeCloseTo(viaPolygon.depth);
    expect(viaAabb.pointCount).toBe(viaPolygon.pointCount);
  });

  it('reports a clean miss rather than NaN for a degenerate polygon', () => {
    const out = createCollisionContactManifold();
    const degenerate: CollisionPolygon = { points: [0, 0, 1, 1] };
    expect(collideAabbPolygonContactManifold({ minX: -1, minY: -1, maxX: 2, maxY: 2 }, degenerate, out)).toBe(false);
    expect(out.overlapping).toBe(false);
    expect(out.pointCount).toBe(0);
    expect(Number.isNaN(out.depth)).toBe(false);
    expect(Number.isNaN(out.normalX)).toBe(false);
  });
});

describe('collideCircleAabbContactManifold', () => {
  it('places the single point on the circle surface at its deepest penetration', () => {
    const out = createCollisionContactManifold();
    const circle: CollisionCircle = { x: 0, y: 0.9, radius: 1 };
    expect(collideCircleAabbContactManifold(circle, ground, out)).toBe(true);
    expect(out.normalY).toBeCloseTo(1);
    expect(out.depth).toBeCloseTo(0.1);
    expect(out.pointCount).toBe(1);
    expect(out.points[0].x).toBeCloseTo(0);
    expect(out.points[0].y).toBeCloseTo(-0.1);
    expect(out.points[0].depth).toBeCloseTo(0.1);
  });

  it('is separated when the circle clears the box', () => {
    const out = createCollisionContactManifold();
    expect(collideCircleAabbContactManifold({ x: 0, y: 4, radius: 1 }, ground, out)).toBe(false);
    expect(out.pointCount).toBe(0);
  });
});

describe('collideCircleCircleContactManifold', () => {
  it('keeps the lean manifold isolated from a nested contact triggered after the lean test', () => {
    let xReads = 0;
    let nestedCalls = 0;
    const a: CollisionCircle = {
      get x() {
        xReads++;
        if (xReads === 3) {
          nestedCalls++;
          collideCircleCircleContactManifold(
            { x: 0, y: 0, radius: 1 },
            { x: 0.5, y: 0, radius: 1 },
            createCollisionContactManifold(),
          );
        }
        return 0;
      },
      y: 0,
      radius: 1,
    };
    const out = createCollisionContactManifold();

    expect(collideCircleCircleContactManifold(a, { x: 1.5, y: 0, radius: 1 }, out)).toBe(true);
    expect(nestedCalls).toBe(1);
    expect(out.depth).toBeCloseTo(0.5);
    expect(out.points[0].depth).toBeCloseTo(0.5);
    expect(out.points[0].x).toBeCloseTo(1);
  });

  it('places the point on A surface along the contact normal', () => {
    const out = createCollisionContactManifold();
    const a: CollisionCircle = { x: 0, y: 0, radius: 1 };
    const b: CollisionCircle = { x: 1.5, y: 0, radius: 1 };
    expect(collideCircleCircleContactManifold(a, b, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(0.5);
    expect(out.pointCount).toBe(1);
    expect(out.points[0].x).toBeCloseTo(1);
    expect(out.points[0].y).toBeCloseTo(0);
    expect(out.points[0].depth).toBeCloseTo(0.5);
  });

  it('agrees with the lean overlap test on normal and depth', () => {
    const contact = createCollisionContactManifold();
    const lean = createCollisionManifold();
    const a: CollisionCircle = { x: 1, y: 2, radius: 3 };
    const b: CollisionCircle = { x: 4, y: 6, radius: 4 };
    expect(collideCircleCircleContactManifold(a, b, contact)).toBe(true);
    expect(testCircleCircleCollision(a, b, lean)).toBe(true);
    expect(contact.normalX).toBeCloseTo(lean.normalX);
    expect(contact.normalY).toBeCloseTo(lean.normalY);
    expect(contact.depth).toBeCloseTo(lean.depth);
  });

  it('clears a previously populated manifold on a miss', () => {
    const out = createCollisionContactManifold();
    expect(collideCircleCircleContactManifold({ x: 0, y: 0, radius: 1 }, { x: 1.5, y: 0, radius: 1 }, out)).toBe(true);
    expect(collideCircleCircleContactManifold({ x: 0, y: 0, radius: 1 }, { x: 9, y: 0, radius: 1 }, out)).toBe(false);
    expect(out.pointCount).toBe(0);
    expect(out.overlapping).toBe(false);
  });
});

describe('collideCircleObbContactManifold', () => {
  it('places the point on the circle surface in the rotated box frame', () => {
    const out = createCollisionContactManifold();
    // The box is rotated a quarter turn, so its half-extents swap: it spans y[-1,1] about the origin.
    const box: CollisionObb = { x: 0, y: 0, halfW: 1, halfH: 4, rotation: Math.PI / 2 };
    const circle: CollisionCircle = { x: 0, y: 1.9, radius: 1 };
    expect(collideCircleObbContactManifold(circle, box, out)).toBe(true);
    expect(out.normalY).toBeCloseTo(1);
    expect(out.depth).toBeCloseTo(0.1);
    expect(out.pointCount).toBe(1);
    expect(out.points[0].y).toBeCloseTo(0.9);
  });

  it('is separated when the circle clears the rotated box', () => {
    const out = createCollisionContactManifold();
    expect(
      collideCircleObbContactManifold(
        { x: 0, y: 20, radius: 1 },
        { x: 0, y: 0, halfW: 1, halfH: 4, rotation: 0.7 },
        out,
      ),
    ).toBe(false);
    expect(out.pointCount).toBe(0);
  });
});

describe('collideCirclePolygonContactManifold', () => {
  it('places the point on the circle surface below the polygon face', () => {
    const out = createCollisionContactManifold();
    const circle: CollisionCircle = { x: 2.5, y: 5.9, radius: 1 };
    expect(collideCirclePolygonContactManifold(circle, square(0, 0, 5), out)).toBe(true);
    expect(out.normalY).toBeCloseTo(1);
    expect(out.depth).toBeCloseTo(0.1);
    expect(out.pointCount).toBe(1);
    expect(out.points[0].x).toBeCloseTo(2.5);
    expect(out.points[0].y).toBeCloseTo(4.9);
  });

  it('resolves a corner contact to one point without reporting a face', () => {
    const out = createCollisionContactManifold();
    // Sitting diagonally off the square's top-right corner, just inside the radius.
    const circle: CollisionCircle = { x: 5.6, y: 5.6, radius: 1 };
    expect(collideCirclePolygonContactManifold(circle, square(0, 0, 5), out)).toBe(true);
    expect(out.pointCount).toBe(1);
    expect(out.normalX).toBeCloseTo(Math.SQRT1_2);
    expect(out.normalY).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('collideObbObbContactManifold', () => {
  it('resolves two aligned oriented boxes to a two-point face contact', () => {
    const out = createCollisionContactManifold();
    const upper: CollisionObb = { x: 0, y: 0.9, halfW: 1, halfH: 1, rotation: 0 };
    const lower: CollisionObb = { x: 0, y: -1, halfW: 1, halfH: 1, rotation: 0 };
    expect(collideObbObbContactManifold(upper, lower, out)).toBe(true);
    expect(out.normalY).toBeCloseTo(1);
    expect(out.depth).toBeCloseTo(0.1);
    expect(out.pointCount).toBe(2);
    const xs = livePoints(out)
      .map((point) => point.x)
      .sort((left, right) => left - right);
    expect(xs[0]).toBeCloseTo(-1);
    expect(xs[1]).toBeCloseTo(1);
  });

  it('agrees with the lean overlap test on normal and depth for a rotated pair', () => {
    const contact = createCollisionContactManifold();
    const lean = createCollisionManifold();
    const a: CollisionObb = { x: 0, y: 0, halfW: 2, halfH: 1, rotation: 0.4 };
    const b: CollisionObb = { x: 2.5, y: 0.5, halfW: 1, halfH: 1.5, rotation: -0.2 };
    expect(collideObbObbContactManifold(a, b, contact)).toBe(true);
    expect(testObbObbCollision(a, b, lean)).toBe(true);
    expect(contact.normalX).toBeCloseTo(lean.normalX);
    expect(contact.normalY).toBeCloseTo(lean.normalY);
    expect(contact.depth).toBeCloseTo(lean.depth);
  });

  it('keeps every contact point at or behind the contact plane', () => {
    const out = createCollisionContactManifold();
    const a: CollisionObb = { x: 0, y: 0, halfW: 2, halfH: 1, rotation: 0.4 };
    const b: CollisionObb = { x: 2.5, y: 0.5, halfW: 1, halfH: 1.5, rotation: -0.2 };
    expect(collideObbObbContactManifold(a, b, out)).toBe(true);
    expect(out.pointCount).toBeGreaterThan(0);
    for (const point of livePoints(out)) {
      expect(point.depth).toBeGreaterThan(0);
      expect(point.depth).toBeLessThanOrEqual(out.depth + 1e-9);
    }
  });
});

describe('collideObbPolygonContactManifold', () => {
  it('resolves an oriented box resting on a polygon slab to two points', () => {
    const out = createCollisionContactManifold();
    const box: CollisionObb = { x: 2.5, y: 5.9, halfW: 1, halfH: 1, rotation: 0 };
    expect(collideObbPolygonContactManifold(box, square(0, 0, 5), out)).toBe(true);
    expect(out.normalY).toBeCloseTo(1);
    expect(out.depth).toBeCloseTo(0.1);
    expect(out.pointCount).toBe(2);
  });

  it('is separated when the box clears the polygon', () => {
    const out = createCollisionContactManifold();
    expect(
      collideObbPolygonContactManifold({ x: 50, y: 50, halfW: 1, halfH: 1, rotation: 0 }, square(0, 0, 5), out),
    ).toBe(false);
    expect(out.pointCount).toBe(0);
  });
});

describe('collidePolygonPolygonContactManifold', () => {
  it('resolves a square resting on a slab to two points spanning the overlap', () => {
    const out = createCollisionContactManifold();
    expect(collidePolygonPolygonContactManifold(square(0, 4.9, 2), square(0, 0, 5), out)).toBe(true);
    expect(out.normalY).toBeCloseTo(1);
    expect(out.depth).toBeCloseTo(0.1);
    expect(out.pointCount).toBe(2);
    const xs = livePoints(out)
      .map((point) => point.x)
      .sort((left, right) => left - right);
    expect(xs[0]).toBeCloseTo(0);
    expect(xs[1]).toBeCloseTo(2);
  });

  it('agrees with the lean overlap test on normal and depth', () => {
    const contact = createCollisionContactManifold();
    const lean = createCollisionManifold();
    const a = square(0, 4.9, 2);
    const b = square(0, 0, 5);
    expect(collidePolygonPolygonContactManifold(a, b, contact)).toBe(true);
    expect(testPolygonPolygonCollision(a, b, lean)).toBe(true);
    expect(contact.normalX).toBeCloseTo(lean.normalX);
    expect(contact.normalY).toBeCloseTo(lean.normalY);
    expect(contact.depth).toBeCloseTo(lean.depth);
  });

  it('resolves a triangle tip pressed into a face to a single point', () => {
    const out = createCollisionContactManifold();
    const triangle: CollisionPolygon = { points: [2, 4.9, 3, 7, 1, 7] };
    expect(collidePolygonPolygonContactManifold(triangle, square(0, 0, 5), out)).toBe(true);
    expect(out.pointCount).toBe(1);
    expect(out.points[0].x).toBeCloseTo(2);
    expect(out.points[0].y).toBeCloseTo(4.9);
    expect(out.points[0].depth).toBeCloseTo(0.1);
  });

  it('resolves the same contact whichever winding the polygons are given in', () => {
    const counterClockwise = createCollisionContactManifold();
    const clockwise = createCollisionContactManifold();
    const slab = square(0, 0, 5);
    const reversedSlab: CollisionPolygon = { points: [0, 0, 0, 5, 5, 5, 5, 0] };
    expect(collidePolygonPolygonContactManifold(square(0, 4.9, 2), slab, counterClockwise)).toBe(true);
    expect(collidePolygonPolygonContactManifold(square(0, 4.9, 2), reversedSlab, clockwise)).toBe(true);

    expect(clockwise.normalY).toBeCloseTo(counterClockwise.normalY);
    expect(clockwise.depth).toBeCloseTo(counterClockwise.depth);
    expect(clockwise.pointCount).toBe(counterClockwise.pointCount);
  });

  it('reports a clean miss rather than NaN for a polygon with too few vertices', () => {
    const out = createCollisionContactManifold();
    expect(collidePolygonPolygonContactManifold({ points: [0, 0] }, square(0, 0, 5), out)).toBe(false);
    expect(out.pointCount).toBe(0);
    expect(Number.isNaN(out.depth)).toBe(false);
  });
});
