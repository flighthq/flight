import type { CollisionBuiltInShape3D, CollisionRaycastHit3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import {
  createCollisionRaycastHit3D,
  initializeCollisionRaycastHit3D,
  raycastCollisionShape3D,
} from './raycastCollisionShape3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

const hit: CollisionRaycastHit3D = createCollisionRaycastHit3D();

// Every hit must satisfy the parameterization it claims: `origin + direction * fraction` IS the reported
// point. A test that only checks the fraction would pass with the point written from a stale ray.
function expectHitOnRay(
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
): void {
  expect(hit.x).toBeCloseTo(originX + directionX * hit.fraction, 9);
  expect(hit.y).toBeCloseTo(originY + directionY * hit.fraction, 9);
  expect(hit.z).toBeCloseTo(originZ + directionZ * hit.fraction, 9);
}

describe('createCollisionRaycastHit3D', () => {
  it('starts zeroed', () => {
    expect(createCollisionRaycastHit3D()).toMatchObject({
      fraction: 0,
      x: 0,
      y: 0,
      z: 0,
      normalX: 0,
      normalY: 0,
      normalZ: 0,
    });
  });
});

describe('initializeCollisionRaycastHit3D', () => {
  it('is the construction initializer of createCollisionRaycastHit3D', () => {
    expect(typeof initializeCollisionRaycastHit3D).toBe('function');
  });
});
describe('raycastCollisionShape3D', () => {
  const sphere: CollisionBuiltInShape3D = { kind: 'sphere', x: 5, y: 0, z: 0, radius: 1 };
  const aabb: CollisionBuiltInShape3D = { kind: 'aabb', minX: 4, minY: -1, minZ: -1, maxX: 6, maxY: 1, maxZ: 1 };

  it('hits a sphere at its near surface with an outward normal', () => {
    expect(raycastCollisionShape3D(sphere, 0, 0, 0, 1, 0, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(4, 9);
    expect(hit.normalX).toBeCloseTo(-1, 9);
    expectHitOnRay(0, 0, 0, 1, 0, 0);
  });

  it('misses a sphere the ray passes beside', () => {
    expect(raycastCollisionShape3D(sphere, 0, 5, 0, 1, 0, 0, hit)).toBe(false);
  });

  it('misses a sphere behind the origin rather than reporting a negative fraction', () => {
    expect(raycastCollisionShape3D(sphere, 0, 0, 0, -1, 0, 0, hit)).toBe(false);
  });

  it('keeps the fraction in the caller parameterization for an unnormalized direction', () => {
    // Direction of length 2, so the same surface is reached at half the fraction.
    expect(raycastCollisionShape3D(sphere, 0, 0, 0, 2, 0, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(2, 9);
    expectHitOnRay(0, 0, 0, 2, 0, 0);
  });

  it('respects maxFraction as a segment bound without changing the direction', () => {
    expect(raycastCollisionShape3D(sphere, 0, 0, 0, 1, 0, 0, hit, 3.9)).toBe(false);
    expect(raycastCollisionShape3D(sphere, 0, 0, 0, 1, 0, 0, hit, 4.1)).toBe(true);
  });

  it('reports an origin inside the shape as a hit at zero with no normal', () => {
    expect(raycastCollisionShape3D(sphere, 5, 0, 0, 1, 0, 0, hit)).toBe(true);
    expect(hit.fraction).toBe(0);
    expect(hit.normalX).toBe(0);
    expect(hit.normalY).toBe(0);
    expect(hit.normalZ).toBe(0);
    expect(hit.x).toBe(5);
  });

  it('hits an aabb face with the axis normal it crossed', () => {
    expect(raycastCollisionShape3D(aabb, 0, 0, 0, 1, 0, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(4, 9);
    expect(hit.normalX).toBe(-1);
    expect(hit.normalY).toBe(0);
    expect(hit.normalZ).toBe(0);
  });

  it('hits an aabb from every axis with the matching normal', () => {
    expect(raycastCollisionShape3D(aabb, 5, 5, 0, 0, -1, 0, hit)).toBe(true);
    expect(hit.normalY).toBe(1);
    expect(raycastCollisionShape3D(aabb, 5, 0, -5, 0, 0, 1, hit)).toBe(true);
    expect(hit.normalZ).toBe(-1);
  });

  it('misses an aabb the ray runs parallel to and outside', () => {
    // Parallel to x, but above the box in y: the divide-free parallel branch must reject this.
    expect(raycastCollisionShape3D(aabb, 0, 5, 0, 1, 0, 0, hit)).toBe(false);
  });

  it('misses an aabb the ray points away from', () => {
    expect(raycastCollisionShape3D(aabb, 0, 0, 0, -1, 0, 0, hit)).toBe(false);
  });

  it('hits an oriented box on the face its rotation turned toward the ray', () => {
    // A quarter turn about +Y takes the box's long +x axis onto -z, so the ray down -z meets the LONG
    // side at 10 - 4 = 6 rather than the short side at 10 - 1 = 9.
    const spun: CollisionBuiltInShape3D = {
      kind: 'box',
      x: 0,
      y: 0,
      z: 0,
      halfX: 4,
      halfY: 1,
      halfZ: 1,
      rotationX: 0,
      rotationY: Math.sin(Math.PI / 4),
      rotationZ: 0,
      rotationW: Math.cos(Math.PI / 4),
    };
    expect(raycastCollisionShape3D(spun, 0, 0, 10, 0, 0, -1, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(6, 6);
    expect(hit.normalZ).toBeCloseTo(1, 6);
    expectHitOnRay(0, 0, 10, 0, 0, -1);
  });

  it('agrees with the aabb answer for an identity-rotated box', () => {
    const box: CollisionBuiltInShape3D = {
      kind: 'box',
      x: 5,
      y: 0,
      z: 0,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      rotationW: 1,
    };
    expect(raycastCollisionShape3D(box, 0, 0, 0, 1, 0, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(4, 9);
    expect(hit.normalX).toBeCloseTo(-1, 9);
  });

  it('returns a UNIT normal from a rotated box, not one the rotation rescaled', () => {
    const spun: CollisionBuiltInShape3D = {
      kind: 'box',
      x: 0,
      y: 0,
      z: 0,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
      rotationX: 0.5,
      rotationY: 0.5,
      rotationZ: 0.5,
      rotationW: 0.5,
    };
    expect(raycastCollisionShape3D(spun, 0, 0, 10, 0, 0, -1, hit)).toBe(true);
    const length = Math.hypot(hit.normalX, hit.normalY, hit.normalZ);
    expect(length).toBeCloseTo(1, 9);
  });

  it('hits the SIDE of a capsule with a normal perpendicular to its axis', () => {
    const capsule: CollisionBuiltInShape3D = {
      kind: 'capsule',
      x0: -2,
      y0: 0,
      z0: 0,
      x1: 2,
      y1: 0,
      z1: 0,
      radius: 0.5,
    };
    expect(raycastCollisionShape3D(capsule, 0, 5, 0, 0, -1, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(4.5, 9);
    expect(hit.normalY).toBeCloseTo(1, 9);
    expect(hit.normalX).toBeCloseTo(0, 9);
    expectHitOnRay(0, 5, 0, 0, -1, 0);
  });

  it('hits a capsule CAP along the axis, where the side cannot be reached', () => {
    // Down the axis from beyond the end: only the rounded cap is in the way, and its normal points back
    // along the ray.
    const capsule: CollisionBuiltInShape3D = {
      kind: 'capsule',
      x0: -2,
      y0: 0,
      z0: 0,
      x1: 2,
      y1: 0,
      z1: 0,
      radius: 0.5,
    };
    expect(raycastCollisionShape3D(capsule, 10, 0, 0, -1, 0, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(7.5, 9);
    expect(hit.normalX).toBeCloseTo(1, 9);
  });

  it('hits the cap rather than the side just beyond the segment end', () => {
    // Aimed down at x = 2.4, past the end of the segment. The infinite cylinder would report a hit at
    // y = 0.5; the capsule's actual surface there is the sphere cap, which is lower.
    const capsule: CollisionBuiltInShape3D = {
      kind: 'capsule',
      x0: -2,
      y0: 0,
      z0: 0,
      x1: 2,
      y1: 0,
      z1: 0,
      radius: 0.5,
    };
    expect(raycastCollisionShape3D(capsule, 2.4, 5, 0, 0, -1, 0, hit)).toBe(true);
    const expected = Math.sqrt(0.5 * 0.5 - 0.4 * 0.4);
    expect(hit.y).toBeCloseTo(expected, 9);
    expect(hit.y).toBeLessThan(0.5);
  });

  it('misses a capsule the ray passes outside', () => {
    const capsule: CollisionBuiltInShape3D = {
      kind: 'capsule',
      x0: -2,
      y0: 0,
      z0: 0,
      x1: 2,
      y1: 0,
      z1: 0,
      radius: 0.5,
    };
    expect(raycastCollisionShape3D(capsule, 0, 5, 0, 0, 1, 0, hit)).toBe(false);
    expect(raycastCollisionShape3D(capsule, 10, 5, 0, 0, -1, 0, hit)).toBe(false);
  });

  it('treats a zero-length capsule as a sphere', () => {
    const degenerate: CollisionBuiltInShape3D = {
      kind: 'capsule',
      x0: 0,
      y0: 0,
      z0: 0,
      x1: 0,
      y1: 0,
      z1: 0,
      radius: 1,
    };
    expect(raycastCollisionShape3D(degenerate, 0, 5, 0, 0, -1, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(4, 9);
  });

  it('returns a unit normal from every capsule surface', () => {
    const capsule: CollisionBuiltInShape3D = {
      kind: 'capsule',
      x0: -2,
      y0: 0,
      z0: 0,
      x1: 2,
      y1: 0,
      z1: 0,
      radius: 0.5,
    };
    for (const [ox, oy, oz, dx, dy, dz] of [
      [0, 5, 0, 0, -1, 0],
      [10, 0, 0, -1, 0, 0],
      [2.4, 5, 0, 0, -1, 0],
    ]) {
      expect(raycastCollisionShape3D(capsule, ox, oy, oz, dx, dy, dz, hit)).toBe(true);
      expect(Math.hypot(hit.normalX, hit.normalY, hit.normalZ)).toBeCloseTo(1, 9);
    }
  });

  it('declines a non-finite ray rather than producing a NaN hit', () => {
    expect(raycastCollisionShape3D(sphere, Number.NaN, 0, 0, 1, 0, 0, hit)).toBe(false);
    expect(raycastCollisionShape3D(sphere, 0, 0, 0, Number.POSITIVE_INFINITY, 0, 0, hit)).toBe(false);
    expect(raycastCollisionShape3D(sphere, 0, 0, 0, 1, 0, 0, hit, -1)).toBe(false);
  });

  it('declines a zero direction, which names no ray', () => {
    expect(raycastCollisionShape3D(sphere, 0, 0, 0, 0, 0, 0, hit)).toBe(false);
  });

  it('hits a convex hull on the face the ray enters through', () => {
    const cube: CollisionBuiltInShape3D = {
      kind: 'convex',
      points: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
    };
    expect(raycastCollisionShape3D(cube, 0, 5, 0, 0, -1, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(4, 9);
    expect(hit.normalY).toBeCloseTo(1, 9);
    expectHitOnRay(0, 5, 0, 0, -1, 0);
  });

  it('agrees with the equivalent aabb about a hull that is one', () => {
    // Two independent routes to the same surface: slab clipping on three axis pairs, and half-space
    // clipping on twelve derived triangles.
    const cube: CollisionBuiltInShape3D = {
      kind: 'convex',
      points: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
    };
    const box: CollisionBuiltInShape3D = { kind: 'aabb', minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 };
    expect(raycastCollisionShape3D(cube, -5, 0.3, 0.2, 1, 0, 0, hit)).toBe(true);
    const hullFraction = hit.fraction;
    const hullNormalX = hit.normalX;
    expect(raycastCollisionShape3D(box, -5, 0.3, 0.2, 1, 0, 0, hit)).toBe(true);
    expect(hullFraction).toBeCloseTo(hit.fraction, 9);
    expect(hullNormalX).toBeCloseTo(hit.normalX, 9);
  });

  it('misses a hull the ray passes beside', () => {
    const tetra: CollisionBuiltInShape3D = { kind: 'convex', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] };
    // Aimed through the region past the slanted face, inside the bounding box and outside the solid.
    expect(raycastCollisionShape3D(tetra, 0.9, 0.9, 5, 0, 0, -1, hit)).toBe(false);
    expect(raycastCollisionShape3D(tetra, 0.1, 0.1, 5, 0, 0, -1, hit)).toBe(true);
  });

  it('reports an origin inside a convex hull as a hit at zero', () => {
    const cube: CollisionBuiltInShape3D = {
      kind: 'convex',
      points: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
    };
    expect(raycastCollisionShape3D(cube, 0, 0, 0, 1, 0, 0, hit)).toBe(true);
    expect(hit.fraction).toBe(0);
  });

  it('clears the hit record on a miss rather than leaving the previous result', () => {
    expect(raycastCollisionShape3D(sphere, 0, 0, 0, 1, 0, 0, hit)).toBe(true);
    expect(hit.fraction).toBeGreaterThan(0);
    expect(raycastCollisionShape3D(sphere, 0, 50, 0, 1, 0, 0, hit)).toBe(false);
    expect(hit).toMatchObject({ fraction: 0, x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 });
  });
});
