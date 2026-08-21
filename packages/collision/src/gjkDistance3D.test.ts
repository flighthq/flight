import type { CollisionShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import { createCollisionDistance3D, writeCollisionDistance3D } from './gjkDistance3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

const out = createCollisionDistance3D();

function sphere(x: number, y: number, z: number, radius: number): CollisionShape3D {
  return { kind: 'sphere', x, y, z, radius };
}

function aabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): CollisionShape3D {
  return { kind: 'aabb', minX, minY, minZ, maxX, maxY, maxZ };
}

describe('createCollisionDistance3D', () => {
  it('starts zeroed and not overlapping', () => {
    expect(createCollisionDistance3D()).toEqual({
      distance: 0,
      directionX: 0,
      directionY: 0,
      directionZ: 0,
      overlapping: false,
    });
  });
});

describe('writeCollisionDistance3D', () => {
  it('matches the closed form for two separated spheres', () => {
    // Centres 10 apart, radii 1 and 2, so the surfaces are 7 apart. Exact, not approximate: a sphere's
    // support is exact in every direction, so GJK has nothing to approximate.
    expect(writeCollisionDistance3D(sphere(0, 0, 0, 1), sphere(10, 0, 0, 2), out)).toBe(true);
    expect(out.distance).toBeCloseTo(7, 9);
    expect(out.overlapping).toBe(false);
  });

  it('points the direction from B toward A', () => {
    // A at the origin, B out along +x, so separating A from B pushes A along -x.
    writeCollisionDistance3D(sphere(0, 0, 0, 1), sphere(10, 0, 0, 2), out);
    expect(out.directionX).toBeCloseTo(-1, 9);
    expect(out.directionY).toBeCloseTo(0, 9);
    expect(out.directionZ).toBeCloseTo(0, 9);
  });

  it('returns a unit direction', () => {
    writeCollisionDistance3D(sphere(0, 0, 0, 1), sphere(6, 8, 0, 1), out);
    expect(Math.hypot(out.directionX, out.directionY, out.directionZ)).toBeCloseTo(1, 9);
    // Centres 10 apart, radii 1 each.
    expect(out.distance).toBeCloseTo(8, 9);
  });

  it('measures along Z as readily as along X', () => {
    writeCollisionDistance3D(sphere(0, 0, 0, 1), sphere(0, 0, 10, 1), out);
    expect(out.distance).toBeCloseTo(8, 9);
    expect(out.directionZ).toBeCloseTo(-1, 9);
  });

  it('reports overlap rather than a distance for an intersecting pair', () => {
    expect(writeCollisionDistance3D(sphere(0, 0, 0, 2), sphere(1, 0, 0, 2), out)).toBe(false);
    expect(out.overlapping).toBe(true);
    expect(out.distance).toBe(0);
  });

  it('reports overlap for a pair that merely touches', () => {
    // Surfaces exactly coincident. Touching is not a gap, and every other test in the package treats it
    // as the non-separated case.
    expect(writeCollisionDistance3D(sphere(0, 0, 0, 1), sphere(2, 0, 0, 1), out)).toBe(false);
    expect(out.overlapping).toBe(true);
  });

  it('measures face-to-face between two boxes', () => {
    expect(writeCollisionDistance3D(aabb(-1, -1, -1, 1, 1, 1), aabb(5, -1, -1, 7, 1, 1), out)).toBe(true);
    expect(out.distance).toBeCloseTo(4, 9);
    expect(out.directionX).toBeCloseTo(-1, 9);
  });

  it('measures corner-to-corner between two boxes', () => {
    // Diagonally offset, so the closest feature is a VERTEX of each rather than a face. This is the case
    // the simplex has to reduce all the way down to a point for.
    expect(writeCollisionDistance3D(aabb(0, 0, 0, 1, 1, 1), aabb(4, 4, 4, 5, 5, 5), out)).toBe(true);
    expect(out.distance).toBeCloseTo(Math.sqrt(27), 9);
  });

  it('measures edge-to-edge between two boxes', () => {
    // Offset on two axes and overlapping on the third: the closest features are parallel EDGES.
    expect(writeCollisionDistance3D(aabb(0, 0, 0, 1, 1, 1), aabb(4, 4, 0, 5, 5, 1), out)).toBe(true);
    expect(out.distance).toBeCloseTo(Math.sqrt(18), 9);
    expect(out.directionZ).toBeCloseTo(0, 6);
  });

  it('matches the closed form for a sphere against a box face', () => {
    // Sphere centre 6 from the box's +x face, radius 1.
    expect(writeCollisionDistance3D(sphere(7, 0, 0, 1), aabb(-1, -1, -1, 1, 1, 1), out)).toBe(true);
    expect(out.distance).toBeCloseTo(5, 6);
    expect(out.directionX).toBeCloseTo(1, 6);
  });

  it('measures a capsule from its surface, not its axis', () => {
    const capsule: CollisionShape3D = { kind: 'capsule', x0: -2, y0: 0, z0: 0, x1: 2, y1: 0, z1: 0, radius: 0.5 };
    // A sphere directly above the capsule's middle: centres 10 apart, minus 0.5 and minus 1.
    expect(writeCollisionDistance3D(sphere(0, 10, 0, 1), capsule, out)).toBe(true);
    expect(out.distance).toBeCloseTo(8.5, 6);
    expect(out.directionY).toBeCloseTo(1, 6);
  });

  it('measures to a convex hull', () => {
    const cube: CollisionShape3D = {
      kind: 'convex',
      points: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
    };
    expect(writeCollisionDistance3D(sphere(0, 6, 0, 1), cube, out)).toBe(true);
    expect(out.distance).toBeCloseTo(4, 6);
    expect(out.directionY).toBeCloseTo(1, 6);
  });

  it('is symmetric in magnitude and opposite in direction when the arguments swap', () => {
    writeCollisionDistance3D(sphere(0, 0, 0, 1), sphere(0, 9, 0, 2), out);
    const forward = out.distance;
    const forwardY = out.directionY;
    writeCollisionDistance3D(sphere(0, 9, 0, 2), sphere(0, 0, 0, 1), out);

    expect(out.distance).toBeCloseTo(forward, 9);
    expect(out.directionY).toBeCloseTo(-forwardY, 9);
  });

  it('agrees with the overlap test about which side of touching a pair is on', () => {
    // Swept across the transition. The two queries must never disagree, or a caller advancing on the
    // distance would step into a configuration the narrow phase then calls separated.
    for (const gap of [-0.1, -0.001, 0.001, 0.1, 1]) {
      const separated = writeCollisionDistance3D(sphere(0, 0, 0, 1), sphere(2 + gap, 0, 0, 1), out);
      expect(separated).toBe(gap > 0);
      if (separated) expect(out.distance).toBeCloseTo(gap, 6);
    }
  });

  it('declines a kind with no registered support rather than reporting a distance', () => {
    const vendor = { kind: 'acme.blob' } as unknown as CollisionShape3D;
    expect(writeCollisionDistance3D(vendor, sphere(0, 0, 0, 1), out)).toBe(false);
    expect(out.distance).toBe(0);
    expect(out.overlapping).toBe(false);
  });

  it('stays accurate over a wide range of scales', () => {
    // The convergence test is relative, so a scene measured in thousands must converge as tightly as one
    // measured in ones.
    for (const scale of [0.001, 1, 1000]) {
      writeCollisionDistance3D(sphere(0, 0, 0, scale), sphere(10 * scale, 0, 0, scale), out);
      expect(out.distance / scale).toBeCloseTo(8, 6);
    }
  });
});
