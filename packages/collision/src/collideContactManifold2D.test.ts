import type { CollisionShape2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { collideContactManifold2D } from './collideContactManifold2D';
import { createCollisionContactManifold2D } from './contactManifold';
import { collideAabbAabbContactManifold, collideCircleAabbContactManifold } from './shapeContact';

describe('collideContactManifold2D', () => {
  it('dispatches a box-box pair to the same contact as the direct function', () => {
    const dispatched = createCollisionContactManifold2D();
    const direct = createCollisionContactManifold2D();
    const box: CollisionShape2D = { kind: 'aabb', minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 };
    const ground: CollisionShape2D = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };

    expect(collideContactManifold2D(box, ground, dispatched)).toBe(true);
    expect(collideAabbAabbContactManifold(box, ground, direct)).toBe(true);
    expect(dispatched.normalY).toBeCloseTo(direct.normalY);
    expect(dispatched.depth).toBeCloseTo(direct.depth);
    expect(dispatched.pointCount).toBe(direct.pointCount);
    for (let i = 0; i < direct.pointCount; i++) {
      expect(dispatched.points[i].x).toBeCloseTo(direct.points[i].x);
      expect(dispatched.points[i].y).toBeCloseTo(direct.points[i].y);
    }
  });

  it('dispatches a circle-box pair given in either kind order', () => {
    const dispatched = createCollisionContactManifold2D();
    const direct = createCollisionContactManifold2D();
    const circle: CollisionShape2D = { kind: 'circle', x: 0, y: 0.9, radius: 1 };
    const ground: CollisionShape2D = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };

    expect(collideContactManifold2D(circle, ground, dispatched)).toBe(true);
    expect(collideCircleAabbContactManifold(circle, ground, direct)).toBe(true);
    expect(dispatched.normalY).toBeCloseTo(direct.normalY);
    expect(dispatched.points[0].y).toBeCloseTo(direct.points[0].y);
  });

  it('negates the normal but keeps the world-space points when the pair arrives reversed', () => {
    const forward = createCollisionContactManifold2D();
    const reversed = createCollisionContactManifold2D();
    const circle: CollisionShape2D = { kind: 'circle', x: 0, y: 0.9, radius: 1 };
    const ground: CollisionShape2D = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };

    expect(collideContactManifold2D(circle, ground, forward)).toBe(true);
    expect(collideContactManifold2D(ground, circle, reversed)).toBe(true);
    expect(reversed.normalX).toBeCloseTo(-forward.normalX);
    expect(reversed.normalY).toBeCloseTo(-forward.normalY);
    expect(reversed.depth).toBeCloseTo(forward.depth);
    expect(reversed.points[0].x).toBeCloseTo(forward.points[0].x);
    expect(reversed.points[0].y).toBeCloseTo(forward.points[0].y);
  });

  it('assigns identical feature ids to a mixed-kind pair given in either order', () => {
    // Different kinds are ordered by kind rank before dispatch, so the same shape owns the reference
    // face either way round and the ids are genuinely order-invariant.
    const forward = createCollisionContactManifold2D();
    const reversed = createCollisionContactManifold2D();
    const box: CollisionShape2D = { kind: 'aabb', minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 };
    const ground: CollisionShape2D = { kind: 'polygon', points: [-5, -1, 5, -1, 5, 0, -5, 0] };

    expect(collideContactManifold2D(box, ground, forward)).toBe(true);
    expect(collideContactManifold2D(ground, box, reversed)).toBe(true);
    expect(reversed.pointCount).toBe(forward.pointCount);
    for (let i = 0; i < forward.pointCount; i++) {
      expect(reversed.points[i].featureId).toBe(forward.points[i].featureId);
      expect(reversed.points[i].x).toBeCloseTo(forward.points[i].x);
      expect(reversed.points[i].y).toBeCloseTo(forward.points[i].y);
    }
  });

  it('keeps overlap, normal and depth order-invariant for a same-kind pair, but not point identity', () => {
    // Two AABBs tie exactly on separation, so the reference face resolves toward the first argument and
    // the contact points land on whichever surface that selects. The pair-level answer is unchanged —
    // the normal negates and the depth is equal — while the points sit one penetration depth apart and
    // carry different ids. Pinned deliberately: a caller keying a warm-start cache on these ids must
    // supply a stable argument order, and this is the behaviour it would otherwise be surprised by.
    const forward = createCollisionContactManifold2D();
    const reversed = createCollisionContactManifold2D();
    const box: CollisionShape2D = { kind: 'aabb', minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 };
    const ground: CollisionShape2D = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };

    expect(collideContactManifold2D(box, ground, forward)).toBe(true);
    expect(collideContactManifold2D(ground, box, reversed)).toBe(true);
    expect(reversed.normalX).toBeCloseTo(-forward.normalX);
    expect(reversed.normalY).toBeCloseTo(-forward.normalY);
    expect(reversed.depth).toBeCloseTo(forward.depth);
    expect(reversed.pointCount).toBe(forward.pointCount);
    expect(reversed.points[0].y).toBeCloseTo(forward.points[0].y - forward.depth);
    expect(reversed.points[0].featureId).not.toBe(forward.points[0].featureId);
  });

  it('is bit-for-bit repeatable for a fixed argument order', () => {
    // The stability a warm-start cache actually depends on: the same call, made again, produces the
    // same ids and the same points. Order-invariance is the caller's to arrange; repeatability is ours.
    const first = createCollisionContactManifold2D();
    const second = createCollisionContactManifold2D();
    const box: CollisionShape2D = { kind: 'aabb', minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 };
    const ground: CollisionShape2D = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };

    expect(collideContactManifold2D(box, ground, first)).toBe(true);
    expect(collideContactManifold2D(box, ground, second)).toBe(true);
    expect(second.pointCount).toBe(first.pointCount);
    for (let i = 0; i < first.pointCount; i++) {
      expect(second.points[i].featureId).toBe(first.points[i].featureId);
      expect(second.points[i].x).toBe(first.points[i].x);
      expect(second.points[i].y).toBe(first.points[i].y);
      expect(second.points[i].depth).toBe(first.points[i].depth);
    }
  });

  it('reports area-less kinds as non-overlapping and carrying no contact', () => {
    const out = createCollisionContactManifold2D();
    const segment: CollisionShape2D = { kind: 'segment', x0: 0, y0: 0, x1: 5, y1: 5 };
    const box: CollisionShape2D = { kind: 'aabb', minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(collideContactManifold2D(segment, box, out)).toBe(false);
    expect(out.overlapping).toBe(false);
    expect(out.pointCount).toBe(0);

    const point: CollisionShape2D = { kind: 'point', x: 1, y: 1 };
    expect(collideContactManifold2D(point, box, out)).toBe(false);
    expect(out.pointCount).toBe(0);
  });

  it('clears a previously populated manifold when the pair separates', () => {
    const out = createCollisionContactManifold2D();
    const ground: CollisionShape2D = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };
    expect(collideContactManifold2D({ kind: 'aabb', minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 }, ground, out)).toBe(true);
    expect(out.pointCount).toBe(2);
    expect(collideContactManifold2D({ kind: 'aabb', minX: 0, minY: 9, maxX: 2, maxY: 11 }, ground, out)).toBe(false);
    expect(out.pointCount).toBe(0);
    expect(out.depth).toBe(0);
    // The NORMAL is the field a stale manifold reports most convincingly: a caller that checks the
    // boolean is safe, but one that reads the normal after a false return gets the previous hit's
    // direction, which is a plausible value rather than an obviously wrong one.
    expect(out.overlapping).toBe(false);
    expect(out.normalX).toBe(0);
    expect(out.normalY).toBe(0);
  });

  it('clears the same manifold when the following pair is a DIFFERENT kind that misses', () => {
    // Reuse across kinds, because the miss path is per-kind: a pair that clears correctly within its own
    // kind says nothing about the path a different kind takes to the same shared manifold.
    const out = createCollisionContactManifold2D();
    expect(
      collideContactManifold2D(
        { kind: 'obb', halfH: 2, halfW: 2, rotation: 0.3, x: 0, y: 0 },
        { kind: 'obb', halfH: 2, halfW: 2, rotation: -0.2, x: 1, y: 1 },
        out,
      ),
    ).toBe(true);
    expect(out.pointCount).toBeGreaterThan(0);
    expect(Math.abs(out.normalX) + Math.abs(out.normalY)).toBeGreaterThan(0);

    expect(
      collideContactManifold2D(
        { kind: 'circle', radius: 1, x: 0, y: 0 },
        { kind: 'circle', radius: 1, x: 50, y: 0 },
        out,
      ),
    ).toBe(false);
    expect(out).toMatchObject({ depth: 0, normalX: 0, normalY: 0, overlapping: false, pointCount: 0 });
  });

  it('leaves the point ARRAY untouched behind pointCount, which is the contract callers read', () => {
    // Stated rather than assumed: clearing resets pointCount, not the two point slots behind it. A test
    // asserting the slots were zeroed would be pinning an implementation detail the contract does not
    // promise, and would fail the day the manifold reuses its allocation differently.
    const out = createCollisionContactManifold2D();
    expect(
      collideContactManifold2D(
        { kind: 'aabb', maxX: 2, maxY: 2, minX: 0, minY: 0 },
        { kind: 'aabb', maxX: 3, maxY: 3, minX: 1, minY: 1 },
        out,
      ),
    ).toBe(true);
    const populated = out.points.map((point) => ({ x: point.x, y: point.y }));

    expect(
      collideContactManifold2D(
        { kind: 'aabb', maxX: 1, maxY: 1, minX: 0, minY: 0 },
        { kind: 'aabb', maxX: 41, maxY: 41, minX: 40, minY: 40 },
        out,
      ),
    ).toBe(false);

    expect(out.pointCount).toBe(0);
    expect(out.points.map((point) => ({ x: point.x, y: point.y }))).toEqual(populated);
  });
});
