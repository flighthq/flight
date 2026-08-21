import type { CollisionBox3D, CollisionManifold3D, CollisionShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import { testCollisionSupport3D } from './gjk3D';
import { createCollisionManifold3D } from './manifold3D';
import {
  testAabbAabbCollision3D,
  testBoxBoxCollision3D,
  testCapsuleCapsuleCollision3D,
  testSphereAabbCollision3D,
  testSphereBoxCollision3D,
  testSphereCapsuleCollision3D,
  testSphereSphereCollision3D,
} from './shapeCollision3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

type TestCollisionBox3D = CollisionBox3D & { kind: 'box' };

function createBox3D(overrides: Partial<TestCollisionBox3D> = {}): TestCollisionBox3D {
  return {
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
    ...overrides,
  };
}

// A deterministic xorshift so a failure names one seed and reproduces exactly, rather than a run that
// was unlucky once and green afterwards.
function createRandom(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function agreesWithSupportFloor(
  shapeA: CollisionShape3D,
  shapeB: CollisionShape3D,
  closedForm: CollisionManifold3D,
): { readonly agrees: boolean; readonly detail: string } {
  const floor = createCollisionManifold3D();
  const floorOverlapping = testCollisionSupport3D(shapeA, shapeB, floor);
  if (floorOverlapping !== closedForm.overlapping) {
    return { agrees: false, detail: `overlap ${String(closedForm.overlapping)} vs floor ${String(floorOverlapping)}` };
  }
  if (!floorOverlapping) return { agrees: true, detail: '' };

  // The tolerances are EPA's, not the closed form's, and the asymmetry is the whole reason these pairs
  // exist. EPA terminates on a distance, so its depth converges tightly while its normal on a curved
  // boundary is only good to a few parts in a thousand. The closed form is exact in both; this asserts
  // the floor is close to it, not the reverse.
  //
  // 3e-3 is a MEASURED envelope, not a guessed one. Over the sphere-sphere sweep below, EPA's depth error
  // against the exact analytic value runs a median of 6e-10 and a p95 of 1.7e-5, with a long tail to
  // 2.6e-3 — while the closed form's own error never exceeds 4.4e-16. A tighter number here would fail on
  // EPA's tail and tempt a reader into suspecting the closed form, which is the one thing verified exact.
  if (Math.abs(floor.depth - closedForm.depth) > 3e-3) {
    return { agrees: false, detail: `depth ${String(closedForm.depth)} vs floor ${String(floor.depth)}` };
  }
  // 0.96 is likewise measured, and it is the number that most justifies this whole file. Over the
  // sphere-sphere sweep, EPA's normal against the exact centre line is essentially perfect at the median
  // (dot 0.9999999999) and still fine at p5 (0.99998) — but the worst case is dot 0.9656, which is a
  // FIFTEEN DEGREE error. On a contact normal that is a visibly wrong bounce direction, not a rounding
  // artifact, and it is what a closed form for a curved boundary buys.
  const dot =
    floor.normalX * closedForm.normalX + floor.normalY * closedForm.normalY + floor.normalZ * closedForm.normalZ;
  if (dot < 0.96) {
    return { agrees: false, detail: `normal dot ${String(dot)}` };
  }
  return { agrees: true, detail: '' };
}

describe('shapeCollision3D agreement with the generic support floor', () => {
  // The bar the 2D set met: a specialization that disagreed with the floor would be a second answer to
  // the same question, and which one a caller got would depend on whether a registrar had been called.
  it('agrees with GJK/EPA on sphere-sphere over seeded configurations', () => {
    const random = createRandom(20260821);
    const out = createCollisionManifold3D();
    let compared = 0;
    for (let i = 0; i < 600; i += 1) {
      const radiusA = 0.4 + random() * 2;
      const radiusB = 0.4 + random() * 2;
      const a = { kind: 'sphere' as const, radius: radiusA, x: 0, y: 0, z: 0 };
      const b = {
        kind: 'sphere' as const,
        radius: radiusB,
        x: (random() - 0.5) * 8,
        y: (random() - 0.5) * 8,
        z: (random() - 0.5) * 8,
      };
      // The razor edge, where the two methods legitimately differ by their own tolerances, is excluded
      // rather than papered over: it is a real disagreement about an ambiguous case, not a defect.
      const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const separation = distance - (radiusA + radiusB);
      if (Math.abs(separation) < 1e-3) continue;

      testSphereSphereCollision3D(a, b, out);

      // The primary assertion, and the strong one: the closed form against the EXACT analytic depth,
      // computed here independently of the function under test. Agreement with EPA below is a weaker
      // check on a weaker instrument — it catches a second answer having appeared, not a wrong one.
      if (out.overlapping) {
        expect(out.depth).toBeCloseTo(radiusA + radiusB - distance, 12);
      }

      const result = agreesWithSupportFloor(a, b, out);
      expect(result.agrees, `seed step ${String(i)}: ${result.detail}`).toBe(true);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(500);
  });

  it('agrees with GJK/EPA on sphere-capsule over seeded configurations', () => {
    const random = createRandom(7717);
    const out = createCollisionManifold3D();
    let compared = 0;
    for (let i = 0; i < 400; i += 1) {
      const a = {
        kind: 'sphere' as const,
        radius: 0.5 + random() * 1.5,
        x: (random() - 0.5) * 6,
        y: (random() - 0.5) * 6,
        z: (random() - 0.5) * 6,
      };
      const b = {
        kind: 'capsule' as const,
        radius: 0.5 + random() * 1.2,
        x0: -2,
        x1: 2,
        y0: 0,
        y1: 0,
        z0: 0,
        z1: 0,
      };
      const t = Math.max(-2, Math.min(2, a.x));
      const distance = Math.hypot(a.x - t, a.y, a.z);
      const separation = distance - (a.radius + b.radius);
      if (Math.abs(separation) < 1e-3) continue;

      testSphereCapsuleCollision3D(a, b, out);
      if (out.overlapping) {
        expect(out.depth).toBeCloseTo(a.radius + b.radius - distance, 12);
      }

      const result = agreesWithSupportFloor(a, b, out);
      expect(result.agrees, `seed step ${String(i)}: ${result.detail}`).toBe(true);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(300);
  });

  it('agrees with GJK/EPA on sphere-aabb over seeded configurations', () => {
    const random = createRandom(31337);
    const out = createCollisionManifold3D();
    let compared = 0;
    for (let i = 0; i < 400; i += 1) {
      const a = {
        kind: 'sphere' as const,
        radius: 0.4 + random() * 1.2,
        x: (random() - 0.5) * 7,
        y: (random() - 0.5) * 7,
        z: (random() - 0.5) * 7,
      };
      const b = { kind: 'aabb' as const, maxX: 1.5, maxY: 1, maxZ: 2, minX: -1.5, minY: -1, minZ: -2 };
      const closestX = Math.max(b.minX, Math.min(b.maxX, a.x));
      const closestY = Math.max(b.minY, Math.min(b.maxY, a.y));
      const closestZ = Math.max(b.minZ, Math.min(b.maxZ, a.z));
      const distance = Math.hypot(a.x - closestX, a.y - closestY, a.z - closestZ);
      const separation = distance - a.radius;
      // Centres INSIDE the box are excluded, and the test has to say so by asking whether the centre is
      // inside rather than by comparing the separation. When the centre is inside, the clamped point IS
      // the centre and `distance` is exactly 0, so `separation` is exactly `-radius` — a `< -radius` test
      // never fires and the inside cases sail through into an exact-depth assertion written for the
      // outside case. The inside branch has its own unit test above; its depth is radius plus the escape
      // to the nearest face, which is a different formula, not a different answer to the same one.
      const centreInside = a.x > b.minX && a.x < b.maxX && a.y > b.minY && a.y < b.maxY && a.z > b.minZ && a.z < b.maxZ;
      if (centreInside || Math.abs(separation) < 1e-3) continue;

      testSphereAabbCollision3D(a, b, out);
      if (out.overlapping) {
        expect(out.depth).toBeCloseTo(a.radius - distance, 12);
      }

      const result = agreesWithSupportFloor(a, b, out);
      expect(result.agrees, `seed step ${String(i)}: ${result.detail}`).toBe(true);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(200);
  });
});

describe('testAabbAabbCollision3D', () => {
  it('reports the shallowest axis as the minimum translation', () => {
    const out = createCollisionManifold3D();
    // Deep in x and z, shallow in y, so y is the escape.
    expect(
      testAabbAabbCollision3D(
        { maxX: 5, maxY: 1.5, maxZ: 5, minX: 0, minY: 0, minZ: 0 },
        { maxX: 5, maxY: 5, maxZ: 5, minX: 0, minY: 1, minZ: 0 },
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 10);
    expect([out.normalX, out.normalY, out.normalZ]).toEqual([0, -1, 0]);
  });

  it('treats a shared face as not overlapping', () => {
    const out = createCollisionManifold3D();
    expect(
      testAabbAabbCollision3D(
        { maxX: 1, maxY: 1, maxZ: 1, minX: 0, minY: 0, minZ: 0 },
        { maxX: 2, maxY: 1, maxZ: 1, minX: 1, minY: 0, minZ: 0 },
        out,
      ),
    ).toBe(false);
    expect(out).toEqual({ depth: 0, normalX: 0, normalY: 0, normalZ: 0, overlapping: false });
  });

  it('separates on every axis independently', () => {
    const out = createCollisionManifold3D();
    const base = { maxX: 1, maxY: 1, maxZ: 1, minX: 0, minY: 0, minZ: 0 } as const;
    expect(testAabbAabbCollision3D(base, { ...base, maxZ: 9, minZ: 8 }, out)).toBe(false);
    expect(testAabbAabbCollision3D(base, { ...base, maxY: 9, minY: 8 }, out)).toBe(false);
  });

  it('rejects a degenerate box rather than reporting an overlap', () => {
    const out = createCollisionManifold3D();
    expect(
      testAabbAabbCollision3D(
        { maxX: 0, maxY: 1, maxZ: 1, minX: 0, minY: 0, minZ: 0 },
        { maxX: 1, maxY: 1, maxZ: 1, minX: 0, minY: 0, minZ: 0 },
        out,
      ),
    ).toBe(false);
  });
});

describe('testBoxBoxCollision3D', () => {
  it('reports the shallowest face axis and A-out-of-B orientation', () => {
    const out = createCollisionManifold3D();
    expect(testBoxBoxCollision3D(createBox3D(), createBox3D({ x: 1.5 }), out)).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 12);
    expect([out.normalX, out.normalY, out.normalZ]).toEqual([-1, 0, 0]);
  });

  it('measures a rotated face in world space', () => {
    const half = Math.SQRT1_2;
    const out = createCollisionManifold3D();
    expect(
      testBoxBoxCollision3D(createBox3D({ halfX: 2, rotationW: half, rotationZ: half }), createBox3D({ y: 2.5 }), out),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 12);
    expect(out.normalX).toBeCloseTo(0, 12);
    expect(out.normalY).toBeCloseTo(-1, 12);
    expect(out.normalZ).toBeCloseTo(0, 12);
  });

  it('treats touching as separated and clears a previous answer', () => {
    const out = createCollisionManifold3D();
    expect(testBoxBoxCollision3D(createBox3D(), createBox3D({ x: 1.5 }), out)).toBe(true);
    expect(testBoxBoxCollision3D(createBox3D(), createBox3D({ x: 2 }), out)).toBe(false);
    expect(out).toEqual({ depth: 0, normalX: 0, normalY: 0, normalZ: 0, overlapping: false });
  });

  it('normalizes scaled quaternion inputs before constructing axes', () => {
    const out = createCollisionManifold3D();
    expect(testBoxBoxCollision3D(createBox3D({ rotationW: 2 }), createBox3D({ x: 1.5 }), out)).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 12);
    expect(out.normalX).toBe(-1);
  });

  it('agrees with the generic convex floor over seeded orientations and separations', () => {
    const random = createRandom(0x3db0_0b3);
    const direct = createCollisionManifold3D();
    const floor = createCollisionManifold3D();
    for (let i = 0; i < 400; i += 1) {
      const angleA = (random() - 0.5) * Math.PI * 2;
      const angleB = (random() - 0.5) * Math.PI * 2;
      const a = createBox3D({
        halfX: 0.25 + random() * 1.75,
        halfY: 0.25 + random() * 1.75,
        halfZ: 0.25 + random() * 1.75,
        rotationW: Math.cos(angleA * 0.5),
        rotationZ: Math.sin(angleA * 0.5),
      });
      const b = createBox3D({
        halfX: 0.25 + random() * 1.75,
        halfY: 0.25 + random() * 1.75,
        halfZ: 0.25 + random() * 1.75,
        rotationW: Math.cos(angleB * 0.5),
        rotationZ: Math.sin(angleB * 0.5),
        x: (random() - 0.5) * 6,
        y: (random() - 0.5) * 6,
        z: (random() - 0.5) * 6,
      });
      const directHit = testBoxBoxCollision3D(a, b, direct);
      const floorHit = testCollisionSupport3D(a, b, floor);
      expect(directHit, `seed step ${String(i)}`).toBe(floorHit);
    }
  });
});

describe('testCapsuleCapsuleCollision3D', () => {
  it('finds the crossing point of two perpendicular capsules', () => {
    const out = createCollisionManifold3D();
    // A along x at z=0, B along y at z=0.5. They pass within 0.5 of each other.
    expect(
      testCapsuleCapsuleCollision3D(
        { radius: 0.4, x0: -5, x1: 5, y0: 0, y1: 0, z0: 0, z1: 0 },
        { radius: 0.4, x0: 0, x1: 0, y0: -5, y1: 5, z0: 0.5, z1: 0.5 },
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(0.3, 10);
    expect([out.normalX, out.normalY, out.normalZ]).toEqual([0, 0, -1]);
  });

  it('handles parallel capsules by anchoring deterministically', () => {
    const out = createCollisionManifold3D();
    expect(
      testCapsuleCapsuleCollision3D(
        { radius: 0.5, x0: 0, x1: 4, y0: 0, y1: 0, z0: 0, z1: 0 },
        { radius: 0.5, x0: 0, x1: 4, y0: 0.6, y1: 0.6, z0: 0, z1: 0 },
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(0.4, 10);
    expect(out.normalY).toBeCloseTo(-1, 10);
  });

  it('pushes collinear capsules apart perpendicular to their shared axis', () => {
    // Two capsules on exactly the same line have coincident closest points and no direction to separate
    // along. Choosing the axis itself would slide them without separating, and the solver would never
    // resolve the pair.
    const out = createCollisionManifold3D();
    expect(
      testCapsuleCapsuleCollision3D(
        { radius: 0.5, x0: 0, x1: 4, y0: 0, y1: 0, z0: 0, z1: 0 },
        { radius: 0.5, x0: 0, x1: 4, y0: 0, y1: 0, z0: 0, z1: 0 },
        out,
      ),
    ).toBe(true);
    expect(out.normalX).toBeCloseTo(0, 10);
    expect(Math.hypot(out.normalX, out.normalY, out.normalZ)).toBeCloseTo(1, 10);
  });

  it('reduces to a sphere test when both segments are zero length', () => {
    const out = createCollisionManifold3D();
    expect(
      testCapsuleCapsuleCollision3D(
        { radius: 1, x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 },
        { radius: 1, x0: 1.5, x1: 1.5, y0: 0, y1: 0, z0: 0, z1: 0 },
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 10);
    expect(out.normalX).toBeCloseTo(-1, 10);
  });
});

describe('testSphereAabbCollision3D', () => {
  it('measures from the closest point on the face', () => {
    const out = createCollisionManifold3D();
    expect(
      testSphereAabbCollision3D(
        { kind: 'sphere', radius: 1, x: 0, y: 2.5, z: 0 } as never,
        { maxX: 1, maxY: 2, maxZ: 1, minX: -1, minY: -2, minZ: -1 },
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 10);
    expect([out.normalX, out.normalY, out.normalZ]).toEqual([0, 1, 0]);
  });

  it('escapes through the nearest face when the centre is inside', () => {
    // The clamped closest point degenerates to the centre itself here and carries no direction at all.
    // The box is thinnest in z, so that is the escape, and the depth spans the remaining half-thickness
    // plus the whole radius.
    const out = createCollisionManifold3D();
    expect(
      testSphereAabbCollision3D(
        { kind: 'sphere', radius: 0.25, x: 0, y: 0, z: 0.1 } as never,
        { maxX: 5, maxY: 5, maxZ: 0.5, minX: -5, minY: -5, minZ: -0.5 },
        out,
      ),
    ).toBe(true);
    expect([out.normalX, out.normalY, out.normalZ]).toEqual([0, 0, 1]);
    expect(out.depth).toBeCloseTo(0.25 + 0.4, 10);
  });

  it('reports a sphere touching a face as not overlapping', () => {
    const out = createCollisionManifold3D();
    expect(
      testSphereAabbCollision3D(
        { kind: 'sphere', radius: 1, x: 0, y: 3, z: 0 } as never,
        { maxX: 1, maxY: 2, maxZ: 1, minX: -1, minY: -2, minZ: -1 },
        out,
      ),
    ).toBe(false);
  });
});

describe('testSphereBoxCollision3D', () => {
  it('measures in the rotated frame', () => {
    // A quarter turn about z carries the box's local x axis onto world y, so a box that is long in x
    // becomes long in y and a sphere out along world y meets its END rather than its side.
    const half = Math.SQRT1_2;
    const out = createCollisionManifold3D();
    expect(
      testSphereBoxCollision3D(
        { kind: 'sphere', radius: 1, x: 0, y: 4.5, z: 0 } as never,
        {
          halfX: 4,
          halfY: 1,
          halfZ: 1,
          rotationW: half,
          rotationX: 0,
          rotationY: 0,
          rotationZ: half,
          x: 0,
          y: 0,
          z: 0,
        },
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 6);
    expect(out.normalY).toBeCloseTo(1, 6);
  });

  it('matches the axis-aligned result when the rotation is identity', () => {
    const aligned = createCollisionManifold3D();
    const oriented = createCollisionManifold3D();
    const sphere = { kind: 'sphere', radius: 1, x: 1.2, y: 0.4, z: 0 } as never;
    testSphereAabbCollision3D(sphere, { maxX: 1, maxY: 1, maxZ: 1, minX: -1, minY: -1, minZ: -1 }, aligned);
    testSphereBoxCollision3D(
      sphere,
      { halfX: 1, halfY: 1, halfZ: 1, rotationW: 1, rotationX: 0, rotationY: 0, rotationZ: 0, x: 0, y: 0, z: 0 },
      oriented,
    );
    expect(oriented.depth).toBeCloseTo(aligned.depth, 10);
    expect(oriented.normalX).toBeCloseTo(aligned.normalX, 10);
  });
});

describe('testSphereCapsuleCollision3D', () => {
  it('measures to the closest point on the segment, not to an endpoint', () => {
    const out = createCollisionManifold3D();
    expect(
      testSphereCapsuleCollision3D(
        { kind: 'sphere', radius: 1, x: 2, y: 1.2, z: 0 } as never,
        { radius: 0.5, x0: 0, x1: 4, y0: 0, y1: 0, z0: 0, z1: 0 },
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(0.3, 10);
    expect(out.normalY).toBeCloseTo(1, 10);
  });

  it('clamps past the end of the segment to the cap', () => {
    const out = createCollisionManifold3D();
    expect(
      testSphereCapsuleCollision3D(
        { kind: 'sphere', radius: 1, x: 5, y: 0, z: 0 } as never,
        { radius: 0.5, x0: 0, x1: 4, y0: 0, y1: 0, z0: 0, z1: 0 },
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 10);
    expect(out.normalX).toBeCloseTo(1, 10);
  });
});

describe('testSphereSphereCollision3D', () => {
  it('reports depth and an exact normal along the centre line', () => {
    const out = createCollisionManifold3D();
    expect(
      testSphereSphereCollision3D(
        { kind: 'sphere', radius: 2, x: 0, y: 0, z: 0 } as never,
        { kind: 'sphere', radius: 2, x: 3, y: 0, z: 0 } as never,
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(1, 10);
    expect([out.normalX, out.normalY, out.normalZ]).toEqual([-1, 0, 0]);
  });

  it('treats exactly touching spheres as not overlapping', () => {
    const out = createCollisionManifold3D();
    expect(
      testSphereSphereCollision3D(
        { kind: 'sphere', radius: 1, x: 0, y: 0, z: 0 } as never,
        { kind: 'sphere', radius: 1, x: 2, y: 0, z: 0 } as never,
        out,
      ),
    ).toBe(false);
  });

  it('picks a direction for concentric spheres rather than dividing by zero', () => {
    const out = createCollisionManifold3D();
    expect(
      testSphereSphereCollision3D(
        { kind: 'sphere', radius: 1, x: 4, y: 4, z: 4 } as never,
        { kind: 'sphere', radius: 2, x: 4, y: 4, z: 4 } as never,
        out,
      ),
    ).toBe(true);
    expect(out.depth).toBeCloseTo(3, 10);
    expect(Math.hypot(out.normalX, out.normalY, out.normalZ)).toBeCloseTo(1, 10);
  });
});
