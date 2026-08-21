import type { CollisionBuiltInShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import { getCollisionShapeContainsPoint3D } from './pointContainment3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

describe('getCollisionShapeContainsPoint3D', () => {
  it('contains a point inside a sphere and excludes one outside', () => {
    const sphere: CollisionBuiltInShape3D = { kind: 'sphere', x: 1, y: 2, z: 3, radius: 2 };
    expect(getCollisionShapeContainsPoint3D(sphere, 1, 2, 3)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(sphere, 1, 2, 4.9)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(sphere, 1, 2, 5.1)).toBe(false);
  });

  it('includes a sphere surface point', () => {
    expect(getCollisionShapeContainsPoint3D({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 2 }, 2, 0, 0)).toBe(true);
  });

  it('separates on Z, not only on X and Y', () => {
    // The axis a 2D predicate cannot see. A point far out of plane must not read as contained.
    const sphere: CollisionBuiltInShape3D = { kind: 'sphere', x: 0, y: 0, z: 0, radius: 1 };
    expect(getCollisionShapeContainsPoint3D(sphere, 0, 0, 50)).toBe(false);
  });

  it('contains a point inside an aabb, including on its face', () => {
    const box: CollisionBuiltInShape3D = { kind: 'aabb', minX: -1, minY: -2, minZ: -3, maxX: 1, maxY: 2, maxZ: 3 };
    expect(getCollisionShapeContainsPoint3D(box, 0, 0, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(box, 1, 2, 3)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(box, 1.001, 0, 0)).toBe(false);
    expect(getCollisionShapeContainsPoint3D(box, 0, 0, -3.001)).toBe(false);
  });

  it('rotates the query into an oriented box, rather than testing its bounding extent', () => {
    // A quarter turn about +Y. A unit cube spun this way still occupies the same volume, so the corner
    // of its BOUNDING box at (0.9, 0, 0.9) is inside both — pick a case that distinguishes them instead.
    const spun: CollisionBuiltInShape3D = {
      kind: 'box',
      x: 0,
      y: 0,
      z: 0,
      halfX: 2,
      halfY: 0.5,
      halfZ: 0.5,
      rotationX: 0,
      rotationY: Math.sin(Math.PI / 4),
      rotationZ: 0,
      rotationW: Math.cos(Math.PI / 4),
    };
    // The long axis has turned from +x onto -z, so a point far along z is inside and one far along x is
    // not. Testing the bounding box would report both inside.
    expect(getCollisionShapeContainsPoint3D(spun, 0, 0, 1.8)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(spun, 1.8, 0, 0)).toBe(false);
  });

  it('matches the aabb answer for an identity-rotated box', () => {
    const box: CollisionBuiltInShape3D = {
      kind: 'box',
      x: 0,
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
    expect(getCollisionShapeContainsPoint3D(box, 0.9, 0.9, 0.9)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(box, 1.1, 0, 0)).toBe(false);
  });

  it('contains points within the radius of a capsule segment, at both the middle and the caps', () => {
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
    expect(getCollisionShapeContainsPoint3D(capsule, 0, 0.4, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(capsule, 0, 0.6, 0)).toBe(false);
    // Inside the rounded cap, which is past the segment end.
    expect(getCollisionShapeContainsPoint3D(capsule, 2.4, 0, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(capsule, 2.6, 0, 0)).toBe(false);
  });

  it('treats a zero-length capsule as a sphere', () => {
    const degenerate: CollisionBuiltInShape3D = {
      kind: 'capsule',
      x0: 1,
      y0: 1,
      z0: 1,
      x1: 1,
      y1: 1,
      z1: 1,
      radius: 1,
    };
    expect(getCollisionShapeContainsPoint3D(degenerate, 1, 1.9, 1)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(degenerate, 1, 2.1, 1)).toBe(false);
  });

  it('contains a point inside a convex hull and excludes one outside', () => {
    // A unit cube as a bare vertex list — no faces anywhere.
    const cube: CollisionBuiltInShape3D = {
      kind: 'convex',
      points: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
    };
    expect(getCollisionShapeContainsPoint3D(cube, 0, 0, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(cube, 0.9, 0.9, 0.9)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(cube, 1.1, 0, 0)).toBe(false);
    expect(getCollisionShapeContainsPoint3D(cube, 0, 0, -1.1)).toBe(false);
  });

  it('excludes a point just past a hull CORNER that its bounding box would contain', () => {
    // A tetrahedron. (0.9,0.9,0.9) is inside its bounding box and well outside the solid, so a hull test
    // that quietly degraded to bounds would report it contained.
    const tetra: CollisionBuiltInShape3D = { kind: 'convex', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] };
    expect(getCollisionShapeContainsPoint3D(tetra, 0.1, 0.1, 0.1)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(tetra, 0.9, 0.9, 0.9)).toBe(false);
  });

  it('returns false for an empty hull', () => {
    expect(getCollisionShapeContainsPoint3D({ kind: 'convex', points: [] }, 0, 0, 0)).toBe(false);
  });

  it('does not retain the caller hull array between calls', () => {
    // The hull is bound into module scratch to avoid a per-call allocation, so a second query against a
    // different hull must not see the first one's points.
    const first: CollisionBuiltInShape3D = { kind: 'convex', points: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10] };
    const second: CollisionBuiltInShape3D = { kind: 'convex', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] };
    expect(getCollisionShapeContainsPoint3D(first, 2, 2, 2)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(second, 2, 2, 2)).toBe(false);
  });
});
