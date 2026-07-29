import type { CollisionShape } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { collideContactManifold } from './collideContactManifold';
import { createCollisionContactManifold } from './contactManifold';
import { collideAabbAabbContactManifold, collideCircleAabbContactManifold } from './shapeContact';

describe('collideContactManifold', () => {
  it('dispatches a box-box pair to the same contact as the direct function', () => {
    const dispatched = createCollisionContactManifold();
    const direct = createCollisionContactManifold();
    const box: CollisionShape = { kind: 'aabb', minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 };
    const ground: CollisionShape = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };

    expect(collideContactManifold(box, ground, dispatched)).toBe(true);
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
    const dispatched = createCollisionContactManifold();
    const direct = createCollisionContactManifold();
    const circle: CollisionShape = { kind: 'circle', x: 0, y: 0.9, radius: 1 };
    const ground: CollisionShape = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };

    expect(collideContactManifold(circle, ground, dispatched)).toBe(true);
    expect(collideCircleAabbContactManifold(circle, ground, direct)).toBe(true);
    expect(dispatched.normalY).toBeCloseTo(direct.normalY);
    expect(dispatched.points[0].y).toBeCloseTo(direct.points[0].y);
  });

  it('negates the normal but keeps the world-space points when the pair arrives reversed', () => {
    const forward = createCollisionContactManifold();
    const reversed = createCollisionContactManifold();
    const circle: CollisionShape = { kind: 'circle', x: 0, y: 0.9, radius: 1 };
    const ground: CollisionShape = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };

    expect(collideContactManifold(circle, ground, forward)).toBe(true);
    expect(collideContactManifold(ground, circle, reversed)).toBe(true);
    expect(reversed.normalX).toBeCloseTo(-forward.normalX);
    expect(reversed.normalY).toBeCloseTo(-forward.normalY);
    expect(reversed.depth).toBeCloseTo(forward.depth);
    expect(reversed.points[0].x).toBeCloseTo(forward.points[0].x);
    expect(reversed.points[0].y).toBeCloseTo(forward.points[0].y);
  });

  it('assigns feature ids against the canonical kind order, so argument order cannot change them', () => {
    const forward = createCollisionContactManifold();
    const reversed = createCollisionContactManifold();
    const box: CollisionShape = { kind: 'aabb', minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 };
    const ground: CollisionShape = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };

    expect(collideContactManifold(box, ground, forward)).toBe(true);
    expect(collideContactManifold(box, ground, reversed)).toBe(true);
    expect(reversed.points[0].featureId).toBe(forward.points[0].featureId);
    expect(reversed.points[1].featureId).toBe(forward.points[1].featureId);
  });

  it('reports area-less kinds as non-overlapping and carrying no contact', () => {
    const out = createCollisionContactManifold();
    const segment: CollisionShape = { kind: 'segment', x0: 0, y0: 0, x1: 5, y1: 5 };
    const box: CollisionShape = { kind: 'aabb', minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(collideContactManifold(segment, box, out)).toBe(false);
    expect(out.overlapping).toBe(false);
    expect(out.pointCount).toBe(0);

    const point: CollisionShape = { kind: 'point', x: 1, y: 1 };
    expect(collideContactManifold(point, box, out)).toBe(false);
    expect(out.pointCount).toBe(0);
  });

  it('clears a previously populated manifold when the pair separates', () => {
    const out = createCollisionContactManifold();
    const ground: CollisionShape = { kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 };
    expect(collideContactManifold({ kind: 'aabb', minX: 0, minY: -0.1, maxX: 2, maxY: 1.9 }, ground, out)).toBe(true);
    expect(out.pointCount).toBe(2);
    expect(collideContactManifold({ kind: 'aabb', minX: 0, minY: 9, maxX: 2, maxY: 11 }, ground, out)).toBe(false);
    expect(out.pointCount).toBe(0);
    expect(out.depth).toBe(0);
  });
});
