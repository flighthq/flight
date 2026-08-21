import type { CollisionShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { collideContactManifold3D } from './collideContactManifold3D';
import { registerBuiltInCollisionFaceQueries3D } from './collisionFace3D';
import { registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import { createCollisionContactManifold3D } from './contactManifold3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

function aabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): CollisionShape3D {
  return { kind: 'aabb', minX, minY, minZ, maxX, maxY, maxZ };
}

describe('collideContactManifold3D', () => {
  it('gives a box resting squarely on a floor FOUR points, one per corner', () => {
    // This is the case the whole contact lane exists for. GJK/EPA alone yields one point, and a box
    // balanced on one point falls over.
    const out = createCollisionContactManifold3D();
    const floor = aabb(-10, -1, -10, 10, 0, 10);
    const crate = aabb(-1, -0.05, -1, 1, 1.95, 1);
    expect(collideContactManifold3D(crate, floor, out)).toBe(true);
    expect(out.pointCount).toBe(4);
    // The floor pushes the crate up, so the normal separating the crate out of the floor is +y.
    expect(out.normalY).toBeCloseTo(1, 6);
    for (let i = 0; i < out.pointCount; i += 1) {
      expect(out.points[i].depth).toBeGreaterThanOrEqual(0);
      // Every point lies on the contact plane between the two.
      expect(out.points[i].y).toBeCloseTo(0, 2);
    }
    // The four points are spread across the crate's footprint rather than piled at one corner.
    const xs = out.points.slice(0, 4).map((point) => point.x);
    const zs = out.points.slice(0, 4).map((point) => point.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2, 2);
  });

  it('reports the overlap depth on each resting point', () => {
    const out = createCollisionContactManifold3D();
    const floor = aabb(-10, -1, -10, 10, 0, 10);
    const crate = aabb(-1, -0.25, -1, 1, 1.75, 1);
    expect(collideContactManifold3D(crate, floor, out)).toBe(true);
    for (let i = 0; i < out.pointCount; i += 1) {
      expect(out.points[i].depth).toBeCloseTo(0.25, 5);
    }
  });

  it('never writes more points than the cap', () => {
    const out = createCollisionContactManifold3D();
    expect(collideContactManifold3D(aabb(-1, -1, -1, 1, 1, 1), aabb(-0.9, -0.9, -0.9, 0.9, 0.9, 0.9), out)).toBe(true);
    expect(out.pointCount).toBeLessThanOrEqual(4);
    expect(out.pointCount).toBeGreaterThan(0);
  });

  it('falls back to a single point for a sphere, which touches at a point', () => {
    const out = createCollisionContactManifold3D();
    const floor = aabb(-10, -1, -10, 10, 0, 10);
    const ball: CollisionShape3D = { kind: 'sphere', x: 0, y: 0.9, z: 0, radius: 1 };
    expect(collideContactManifold3D(ball, floor, out)).toBe(true);
    expect(out.pointCount).toBe(1);
    expect(out.points[0].y).toBeCloseTo(-0.05, 2);
  });

  it('gives a capsule lying on its side two points, so it cannot roll on one', () => {
    const out = createCollisionContactManifold3D();
    const floor = aabb(-10, -1, -10, 10, 0, 10);
    const capsule: CollisionShape3D = {
      kind: 'capsule',
      x0: -2,
      y0: 0.45,
      z0: 0,
      x1: 2,
      y1: 0.45,
      z1: 0,
      radius: 0.5,
    };
    expect(collideContactManifold3D(capsule, floor, out)).toBe(true);
    expect(out.pointCount).toBe(2);
    const xs = out.points.slice(0, 2).map((point) => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);
  });

  it('gives a capsule standing on its end one point, because a cap is curved', () => {
    const out = createCollisionContactManifold3D();
    const floor = aabb(-10, -1, -10, 10, 0, 10);
    const capsule: CollisionShape3D = {
      kind: 'capsule',
      x0: 0,
      y0: 0.45,
      z0: 0,
      x1: 0,
      y1: 4,
      z1: 0,
      radius: 0.5,
    };
    expect(collideContactManifold3D(capsule, floor, out)).toBe(true);
    expect(out.pointCount).toBe(1);
  });

  it('clears the manifold and returns false for a disjoint pair', () => {
    const out = createCollisionContactManifold3D();
    out.overlapping = true;
    out.pointCount = 3;
    out.normalX = 5;
    expect(collideContactManifold3D(aabb(0, 0, 0, 1, 1, 1), aabb(50, 50, 50, 51, 51, 51), out)).toBe(false);
    expect(out.overlapping).toBe(false);
    expect(out.pointCount).toBe(0);
    expect(out.normalX).toBe(0);
  });

  it('keeps the point array identity across a miss so a held reference stays live', () => {
    const out = createCollisionContactManifold3D();
    const points = out.points;
    const first = points[0];
    collideContactManifold3D(aabb(0, 0, 0, 1, 1, 1), aabb(50, 50, 50, 51, 51, 51), out);
    expect(out.points).toBe(points);
    expect(out.points[0]).toBe(first);
  });

  it('gives every point a feature id that is stable across identical calls', () => {
    const first = createCollisionContactManifold3D();
    const second = createCollisionContactManifold3D();
    const floor = aabb(-10, -1, -10, 10, 0, 10);
    const crate = aabb(-1, -0.1, -1, 1, 1.9, 1);
    collideContactManifold3D(crate, floor, first);
    collideContactManifold3D(crate, floor, second);
    expect(first.pointCount).toBe(second.pointCount);
    for (let i = 0; i < first.pointCount; i += 1) {
      expect(first.points[i].featureId).toBe(second.points[i].featureId);
    }
  });

  it('gives the points of one contact distinct feature ids', () => {
    const out = createCollisionContactManifold3D();
    const floor = aabb(-10, -1, -10, 10, 0, 10);
    collideContactManifold3D(aabb(-1, -0.1, -1, 1, 1.9, 1), floor, out);
    const ids = new Set(out.points.slice(0, out.pointCount).map((point) => point.featureId));
    expect(ids.size).toBe(out.pointCount);
  });

  it('handles a rotated box resting on a floor', () => {
    const out = createCollisionContactManifold3D();
    const floor = aabb(-10, -1, -10, 10, 0, 10);
    // Spun about y, so the box still rests on a flat face and should still get four corners.
    const crate: CollisionShape3D = {
      kind: 'box',
      x: 0,
      y: 0.95,
      z: 0,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
      rotationX: 0,
      rotationY: Math.sin(Math.PI / 8),
      rotationZ: 0,
      rotationW: Math.cos(Math.PI / 8),
    };
    expect(collideContactManifold3D(crate, floor, out)).toBe(true);
    expect(out.pointCount).toBe(4);
    expect(out.normalY).toBeCloseTo(1, 4);
  });

  it('agrees with the overlap test about whether a pair touches', () => {
    const out = createCollisionContactManifold3D();
    const floor = aabb(-10, -1, -10, 10, 0, 10);
    // Clear of the floor by a hair: the contact lane must not invent a touch the overlap test denies.
    expect(collideContactManifold3D(aabb(-1, 0.001, -1, 1, 2, 1), floor, out)).toBe(false);
    expect(collideContactManifold3D(aabb(-1, -0.001, -1, 1, 2, 1), floor, out)).toBe(true);
  });
});
