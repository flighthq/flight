import type { CollisionManifold3D, CollisionShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import { testCollisionSupport3D, testCollisionSupportOverlap3D } from './gjk3D';
import { createCollisionManifold3D } from './manifold3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

function sphere(x: number, y: number, z: number, radius: number): CollisionShape3D {
  return { kind: 'sphere', x, y, z, radius };
}

function aabb(minX: number, minY: number, minZ: number, size: number): CollisionShape3D {
  return { kind: 'aabb', minX, minY, minZ, maxX: minX + size, maxY: minY + size, maxZ: minZ + size };
}

// Translating A by `normal * depth` must leave the pair no longer overlapping. This is what the
// manifold CLAIMS, so asserting it directly checks the normal and depth together against the thing a
// solver actually does with them — much stronger than pinning either number alone.
//
// `margin` is the slack the shape family needs. A polytope pair is exact and needs only enough to
// clear floating-point noise; a curved pair lands about 1e-5 short because EPA inscribes a polytope in
// a surface it can only approach, so a margin tighter than that measures the vertex budget rather than
// the manifold. Passing it per-case keeps the exact families asserted exactly instead of relaxing every
// case to the loosest one.
function expectMinimumTranslationSeparates(
  a: Readonly<CollisionShape3D>,
  b: Readonly<CollisionShape3D>,
  manifold: Readonly<CollisionManifold3D>,
  margin: number,
): void {
  const clearBy = manifold.depth + margin;
  const clear = translateShape(a, manifold.normalX * clearBy, manifold.normalY * clearBy, manifold.normalZ * clearBy);
  expect(testCollisionSupportOverlap3D(clear, b)).toBe(false);
  // And falling well short must still overlap, which is what makes the depth MINIMUM rather than
  // merely sufficient — a normal of the right direction but an inflated depth would pass the check
  // above on its own.
  const shortBy = manifold.depth - Math.max(margin, 1e-3) * 10;
  const short = translateShape(a, manifold.normalX * shortBy, manifold.normalY * shortBy, manifold.normalZ * shortBy);
  expect(testCollisionSupportOverlap3D(short, b)).toBe(true);
}

function translateShape(shape: Readonly<CollisionShape3D>, dx: number, dy: number, dz: number): CollisionShape3D {
  if (shape.kind === 'sphere')
    return { kind: 'sphere', x: shape.x + dx, y: shape.y + dy, z: shape.z + dz, radius: shape.radius };
  if (shape.kind === 'aabb') {
    return {
      kind: 'aabb',
      minX: shape.minX + dx,
      minY: shape.minY + dy,
      minZ: shape.minZ + dz,
      maxX: shape.maxX + dx,
      maxY: shape.maxY + dy,
      maxZ: shape.maxZ + dz,
    };
  }
  if (shape.kind === 'capsule') {
    return {
      kind: 'capsule',
      x0: shape.x0 + dx,
      y0: shape.y0 + dy,
      z0: shape.z0 + dz,
      x1: shape.x1 + dx,
      y1: shape.y1 + dy,
      z1: shape.z1 + dz,
      radius: shape.radius,
    };
  }
  if (shape.kind === 'box') return { ...shape, x: shape.x + dx, y: shape.y + dy, z: shape.z + dz };
  if (shape.kind === 'convex') {
    const points = shape.points.slice();
    for (let i = 0; i < points.length; i += 3) {
      points[i] += dx;
      points[i + 1] += dy;
      points[i + 2] += dz;
    }
    return { kind: 'convex', points };
  }
  throw new Error('untranslatable kind');
}

describe('testCollisionSupport3D', () => {
  it('reports the depth and axis for two overlapping spheres, to curved-surface accuracy', () => {
    const out = createCollisionManifold3D();
    expect(testCollisionSupport3D(sphere(0, 0, 0, 1), sphere(1.5, 0, 0, 1), out)).toBe(true);
    expect(out.overlapping).toBe(true);
    // Four places for the depth, not more: EPA inscribes a polytope in the sphere and the vertex
    // budget stops it about 1e-5 short. Asserting six would be asserting MAX_POLYTOPE_VERTICES.
    expect(out.depth).toBeCloseTo(0.5, 4);
    // The NORMAL is held to two places, and the looser bound is the real behaviour rather than a
    // concession: distance is second-order insensitive to angular error, so a depth converged to 1e-5
    // leaves the direction near its square root — measured at 5e-3 here. A caller that needs an exact
    // sphere normal registers the closed-form pair specialization.
    expect(out.normalX).toBeCloseTo(-1, 2);
    expect(out.normalY).toBeCloseTo(0, 2);
    expect(out.normalZ).toBeCloseTo(0, 2);
  });

  it('is EXACT on polytopes, where the Minkowski difference is itself a polytope', () => {
    const out = createCollisionManifold3D();
    expect(testCollisionSupport3D(aabb(0, 0, 0, 2), aabb(1.5, 0, 0, 2), out)).toBe(true);
    expect(out.depth).toBe(0.5);
    expect(out.normalX).toBe(-1);
    expect(testCollisionSupport3D(aabb(0, 0, 0, 2), aabb(1.25, 0, 0, 2), out)).toBe(true);
    expect(out.depth).toBe(0.75);
  });

  it('produces a unit normal', () => {
    const out = createCollisionManifold3D();
    testCollisionSupport3D(sphere(0, 0, 0, 1), sphere(0.7, 0.7, 0.7, 1), out);
    const length = Math.sqrt(out.normalX ** 2 + out.normalY ** 2 + out.normalZ ** 2);
    expect(length).toBeCloseTo(1, 6);
  });

  it('writes a minimum translation that actually separates each overlapping pair', () => {
    const flat = 1e-9;
    const curved = 1e-4;
    const cases: [CollisionShape3D, CollisionShape3D, number][] = [
      [sphere(0, 0, 0, 1), sphere(1.5, 0, 0, 1), curved],
      [sphere(0, 0, 0, 1), sphere(0.5, 0.4, 0.3, 1), curved],
      [aabb(0, 0, 0, 2), aabb(1.5, 0.2, 0.2, 2), flat],
      [aabb(0, 0, 0, 2), sphere(2.5, 1, 1, 1), curved],
      [
        { kind: 'capsule', x0: 0, y0: 0, z0: 0, x1: 0, y1: 2, z1: 0, radius: 0.5 },
        { kind: 'capsule', x0: 0.6, y0: 0, z0: 0, x1: 0.6, y1: 2, z1: 0, radius: 0.5 },
        curved,
      ],
      [aabb(0, 0, 0, 2), { kind: 'capsule', x0: 2.4, y0: 1, z0: 1, x1: 2.4, y1: 3, z1: 1, radius: 0.5 }, curved],
      [{ kind: 'convex', points: [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2] }, aabb(1.5, -1, -1, 2), flat],
    ];
    for (const [a, b, margin] of cases) {
      const out = createCollisionManifold3D();
      expect(testCollisionSupport3D(a, b, out)).toBe(true);
      expectMinimumTranslationSeparates(a, b, out, margin);
    }
  });

  it('returns false and clears the manifold for a disjoint pair', () => {
    const out = createCollisionManifold3D();
    out.overlapping = true;
    out.normalX = 9;
    out.depth = 9;
    expect(testCollisionSupport3D(sphere(0, 0, 0, 1), sphere(10, 0, 0, 1), out)).toBe(false);
    expect(out).toMatchObject({ overlapping: false, normalX: 0, normalY: 0, normalZ: 0, depth: 0 });
  });

  it('returns false for an unregistered kind rather than throwing', () => {
    const out = createCollisionManifold3D();
    expect(testCollisionSupport3D({ kind: 'acme.cone' }, sphere(0, 0, 0, 1), out)).toBe(false);
    expect(out.overlapping).toBe(false);
  });

  it('handles a box rotated about z, using its oriented corners', () => {
    const out = createCollisionManifold3D();
    const halfTurn = Math.SQRT1_2;
    // A unit cube spun 45 degrees about z reaches sqrt(2)/2 ~ 0.707 along x instead of 0.5.
    const rotated: CollisionShape3D = {
      kind: 'box',
      x: 0,
      y: 0,
      z: 0,
      halfX: 0.5,
      halfY: 0.5,
      halfZ: 0.5,
      rotationX: 0,
      rotationY: 0,
      rotationZ: Math.sin(Math.PI / 8),
      rotationW: Math.cos(Math.PI / 8),
    };
    // A sphere just inside the spun corner overlaps; the same sphere would miss an unrotated cube.
    expect(testCollisionSupport3D(rotated, sphere(1.15, 0, 0, 0.5), out)).toBe(true);
    expect(testCollisionSupport3D(rotated, sphere(1.35, 0, 0, 0.5), out)).toBe(false);
    expect(halfTurn).toBeCloseTo(0.7071, 3);
  });

  it('finds a convex hull overlap through its vertex support', () => {
    const out = createCollisionManifold3D();
    // A unit tetrahedron spanning the origin corner.
    const tetra: CollisionShape3D = {
      kind: 'convex',
      points: [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2],
    };
    expect(testCollisionSupport3D(tetra, sphere(0.3, 0.3, 0.3, 0.5), out)).toBe(true);
    expect(testCollisionSupport3D(tetra, sphere(5, 5, 5, 0.5), out)).toBe(false);
  });
});

describe('testCollisionSupportOverlap3D', () => {
  it('separates a clearly disjoint pair', () => {
    expect(testCollisionSupportOverlap3D(sphere(0, 0, 0, 1), sphere(5, 0, 0, 1))).toBe(false);
  });

  it('reports a deep overlap', () => {
    expect(testCollisionSupportOverlap3D(sphere(0, 0, 0, 1), sphere(0.1, 0, 0, 1))).toBe(true);
  });

  it('treats exact touching as not overlapping, matching the rest of the package', () => {
    expect(testCollisionSupportOverlap3D(sphere(0, 0, 0, 1), sphere(2, 0, 0, 1))).toBe(false);
    expect(testCollisionSupportOverlap3D(aabb(0, 0, 0, 1), aabb(1, 0, 0, 1))).toBe(false);
  });

  it('finds an overlap when the centres share an axis, the collinear case', () => {
    // The 2D core documents this as the bug a collinear 1-simplex causes: two shapes whose centres
    // line up on an axis are the most ordinary configuration there is, and an early separation
    // verdict there would be catastrophic and quiet.
    expect(testCollisionSupportOverlap3D(sphere(0, 0, 0, 1), sphere(1, 0, 0, 1))).toBe(true);
    expect(testCollisionSupportOverlap3D(sphere(0, 0, 0, 1), sphere(0, 1, 0, 1))).toBe(true);
    expect(testCollisionSupportOverlap3D(sphere(0, 0, 0, 1), sphere(0, 0, 1, 1))).toBe(true);
  });

  it('finds an overlap when the two shapes are exactly concentric', () => {
    expect(testCollisionSupportOverlap3D(sphere(0, 0, 0, 1), sphere(0, 0, 0, 1))).toBe(true);
    expect(testCollisionSupportOverlap3D(aabb(0, 0, 0, 2), aabb(0, 0, 0, 2))).toBe(true);
  });

  it('agrees with itself when the arguments are swapped', () => {
    const cases: [CollisionShape3D, CollisionShape3D][] = [
      [sphere(0, 0, 0, 1), sphere(1.5, 0, 0, 1)],
      [sphere(0, 0, 0, 1), sphere(9, 0, 0, 1)],
      [aabb(0, 0, 0, 2), aabb(1.5, 1.5, 1.5, 2)],
      [aabb(0, 0, 0, 2), sphere(3.5, 1, 1, 1)],
    ];
    for (const [a, b] of cases) {
      expect(testCollisionSupportOverlap3D(a, b)).toBe(testCollisionSupportOverlap3D(b, a));
    }
  });
});
