import type { CollisionManifold3D } from '@flighthq/types/contract';
import type { CollisionShape3D, CollisionTimeOfImpact3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import { createCollisionManifold3D } from './manifold3D';
import {
  createCollisionTimeOfImpact3D,
  initializeCollisionTimeOfImpact3D,
  sweepCollisionShape3D,
} from './sweepCollisionShape3D';
import { testCollision3D } from './testCollision3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

const out: CollisionTimeOfImpact3D = createCollisionTimeOfImpact3D();

function sphere(x: number, y: number, z: number, radius: number): CollisionShape3D {
  return { kind: 'sphere', x, y, z, radius };
}

function aabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): CollisionShape3D {
  return { kind: 'aabb', minX, minY, minZ, maxX, maxY, maxZ };
}

describe('createCollisionTimeOfImpact3D', () => {
  it('starts zeroed', () => {
    expect(createCollisionTimeOfImpact3D()).toMatchObject({
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

describe('initializeCollisionTimeOfImpact3D', () => {
  it('is the construction initializer of createCollisionTimeOfImpact3D', () => {
    expect(typeof initializeCollisionTimeOfImpact3D).toBe('function');
  });
});

function createManifold(): CollisionManifold3D {
  return createCollisionManifold3D();
}
describe('sweepCollisionShape3D', () => {
  it('finds the exact impact fraction for two approaching spheres', () => {
    // A at x=0 r=1 moving +10x; B fixed at x=10 r=1. Surfaces meet when the centres are 2 apart, so A
    // has travelled 8 of its 10 — fraction 0.8.
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), 10, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out)).toBe(true);
    expect(out.fraction).toBeCloseTo(0.8, 5);
  });

  it('CATCHES A BULLET THAT PASSES CLEAN THROUGH A THIN WALL IN ONE STEP', () => {
    // The whole reason continuous collision exists. The mover starts well clear of the wall and ends well
    // past it, so it never overlaps at either endpoint — a discrete test reports nothing at all.
    const bullet = sphere(-50, 0, 0, 0.1);
    const wall = aabb(-0.05, -20, -20, 0.05, 20, 20);
    expect(testCollision3D(bullet, wall, createManifold())).toBe(false);

    expect(sweepCollisionShape3D(bullet, 100, 0, 0, wall, 0, 0, 0, out)).toBe(true);
    // It reaches the wall's near face after travelling 50 - 0.05 - 0.1 of its 100.
    expect(out.fraction).toBeCloseTo(0.4985, 4);
  });

  it('reports no impact when the shapes move apart', () => {
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), -10, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out)).toBe(false);
  });

  it('reports no impact when the motion falls short', () => {
    // Needs 8 to touch and only travels 5.
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), 5, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out)).toBe(false);
  });

  it('reports no impact for a pair sliding parallel', () => {
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), 0, 100, 0, sphere(10, 0, 0, 1), 0, 0, 0, out)).toBe(false);
  });

  it('accounts for BOTH shapes moving', () => {
    // Closing head-on at 5 each, so the same 8 units of gap close in half the interval.
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), 5, 0, 0, sphere(10, 0, 0, 1), -5, 0, 0, out)).toBe(true);
    expect(out.fraction).toBeCloseTo(0.8, 5);
  });

  it('reports fraction 0 for a pair that already overlaps', () => {
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 2), 10, 0, 0, sphere(1, 0, 0, 2), 0, 0, 0, out)).toBe(true);
    expect(out.fraction).toBe(0);
  });

  it('orients the normal from B toward A', () => {
    sweepCollisionShape3D(sphere(0, 0, 0, 1), 10, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out);
    // A approaches from -x, so pushing A back out of B is along -x.
    expect(out.normalX).toBeCloseTo(-1, 5);
    expect(Math.hypot(out.normalX, out.normalY, out.normalZ)).toBeCloseTo(1, 6);
  });

  it('puts the contact point on A surface at the moment of impact', () => {
    sweepCollisionShape3D(sphere(0, 0, 0, 1), 10, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out);
    // A's centre has reached x=8, and its leading surface point is one radius further.
    expect(out.x).toBeCloseTo(9, 4);
    expect(out.y).toBeCloseTo(0, 4);
  });

  it('reports the contact point where the shapes MEET, not where they were closest beforehand', () => {
    // A head-on approach converges onto exactly touching, so the last measurement with a gap to read a
    // witness from can be a whole interval back. Reporting that witness unadvanced puts the contact at
    // the point A was closest from while still far away — here x=1, its surface at the START of the
    // sweep, rather than x=9 where it actually arrives.
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), 10, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(9, 4);
    expect(out.x).not.toBeCloseTo(1, 1);
    expect(out.x).not.toBeCloseTo(5, 1);
  });

  it('puts the contact point between the two surfaces when B is the one moving', () => {
    // B carries the motion and A is still, which is the mirror of every other case here. The witnesses
    // are measured in a frame that holds B fixed, so this is the arrangement where forgetting to add B's
    // own translation back shows up.
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), 0, 0, 0, sphere(10, 0, 0, 1), -10, 0, 0, out)).toBe(true);
    expect(out.fraction).toBeCloseTo(0.8, 5);
    expect(out.x).toBeCloseTo(1, 4);
  });

  it('finds the mid-segment contact of two crossing capsules', () => {
    // The witness case a support call cannot answer: the capsules meet at the middle of each segment, so
    // a contact point at either END would be two units adrift.
    const alongX: CollisionShape3D = { kind: 'capsule', x0: -2, y0: 0, z0: 0, x1: 2, y1: 0, z1: 0, radius: 0.5 };
    const aboveAlongY: CollisionShape3D = { kind: 'capsule', x0: 0, y0: -2, z0: 5, x1: 0, y1: 2, z1: 5, radius: 0.5 };

    expect(sweepCollisionShape3D(alongX, 0, 0, 10, aboveAlongY, 0, 0, 0, out)).toBe(true);
    // Four units of gap over ten of travel.
    expect(out.fraction).toBeCloseTo(0.4, 4);
    expect(out.x).toBeCloseTo(0, 3);
    expect(out.y).toBeCloseTo(0, 3);
    expect(out.z).toBeCloseTo(4.5, 3);
  });

  it('leaves the pair touching, not overlapping, when advanced to the reported fraction', () => {
    // The property that makes a fraction usable: a step may advance to it and then resolve discretely.
    const a = sphere(0, 0, 0, 1);
    const b = sphere(10, 0, 0, 1);
    expect(sweepCollisionShape3D(a, 10, 0, 0, b, 0, 0, 0, out)).toBe(true);

    const advanced = sphere(10 * out.fraction, 0, 0, 1);
    expect(testCollision3D(advanced, b, createManifold())).toBe(false);
    // And a hair further does overlap, so the fraction is not merely conservative to the point of useless.
    const past = sphere(10 * out.fraction + 0.01, 0, 0, 1);
    expect(testCollision3D(past, b, createManifold())).toBe(true);
  });

  it('sweeps a box against a box', () => {
    expect(sweepCollisionShape3D(aabb(-1, -1, -1, 1, 1, 1), 10, 0, 0, aabb(9, -1, -1, 11, 1, 1), 0, 0, 0, out)).toBe(
      true,
    );
    // Faces meet after 8 of 10.
    expect(out.fraction).toBeCloseTo(0.8, 4);
  });

  it('sweeps along Z as readily as along X', () => {
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), 0, 0, 10, sphere(0, 0, 10, 1), 0, 0, 0, out)).toBe(true);
    expect(out.fraction).toBeCloseTo(0.8, 5);
    expect(out.normalZ).toBeCloseTo(-1, 5);
  });

  it('honours maxFraction as a shorter interval', () => {
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), 10, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out, 0.5)).toBe(false);
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), 10, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out, 0.9)).toBe(true);
  });

  it('declines a non-finite translation rather than producing a NaN fraction', () => {
    expect(sweepCollisionShape3D(sphere(0, 0, 0, 1), Number.NaN, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out)).toBe(false);
    expect(out.fraction).toBe(0);
  });

  it('declines a kind with no registered support', () => {
    const vendor = { kind: 'acme.blob' } as unknown as CollisionShape3D;
    expect(sweepCollisionShape3D(vendor, 10, 0, 0, sphere(10, 0, 0, 1), 0, 0, 0, out)).toBe(false);
  });

  it('agrees with the discrete test at the endpoints of an ordinary approach', () => {
    // Not a tunnelling case: the shapes DO overlap at the end. The sweep must still report a fraction
    // before that, not merely defer to the endpoint.
    const a = sphere(0, 0, 0, 1);
    const b = sphere(10, 0, 0, 1);
    const endpoint = sphere(9, 0, 0, 1);
    expect(testCollision3D(endpoint, b, createManifold())).toBe(true);

    expect(sweepCollisionShape3D(a, 9, 0, 0, b, 0, 0, 0, out)).toBe(true);
    expect(out.fraction).toBeGreaterThan(0);
    expect(out.fraction).toBeLessThan(1);
  });
});
