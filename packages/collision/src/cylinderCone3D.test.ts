import type { CollisionBuiltInShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { getCollisionShapeValidationStatus3D } from './collisionShapeValidation3D';
import {
  registerBuiltInCollisionSupports3D,
  supportCollisionCone3D,
  supportCollisionCylinder3D,
} from './collisionSupport3D';
import { getCollisionShapeContainsPoint3D } from './pointContainment3D';
import { createCollisionRaycastHit3D, raycastCollisionShape3D } from './raycastCollisionShape3D';

// The two round-sided kinds share every seam — support, containment, raycast, validation — so they are
// exercised together rather than split by seam. A defect in one usually shows up as a disagreement
// BETWEEN seams, which is only visible if the seams are tested against each other.

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

function createRandom(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

// The independent instrument for the raycast property test below: walks the ray in small steps and
// reports the first parameter at which the point is inside. It is slow, obvious, and shares no code with
// the analytic raycast, which is the entire point — a bug reproduced identically in both would prove
// nothing.
function findFirstEntryByScanning(
  shape: Readonly<CollisionBuiltInShape3D>,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  limit: number,
): number {
  const steps = 20000;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * limit;
    if (getCollisionShapeContainsPoint3D(shape, ox + dx * t, oy + dy * t, oz + dz * t)) return t;
  }
  return -1;
}

const cylinder: CollisionBuiltInShape3D = { kind: 'cylinder', radius: 1, x0: 0, x1: 0, y0: -2, y1: 2, z0: 0, z1: 0 };
const cone: CollisionBuiltInShape3D = {
  apexX: 0,
  apexY: 3,
  apexZ: 0,
  baseX: 0,
  baseY: 0,
  baseZ: 0,
  kind: 'cone',
  radius: 1.5,
};

describe('getCollisionShapeContainsPoint3D for cylinder and cone', () => {
  it('excludes the corner region a capsule would have included', () => {
    // Just past the cap plane and near the rim. A capsule of the same segment and radius contains this
    // point, because its end is round; a cylinder must not, because its end is flat. This is the single
    // assertion that distinguishes the two kinds.
    expect(getCollisionShapeContainsPoint3D(cylinder, 0.99, 2.05, 0)).toBe(false);
    expect(getCollisionShapeContainsPoint3D({ ...cylinder, kind: 'capsule' }, 0.99, 2.05, 0)).toBe(true);
  });

  it('includes the cylinder interior and its flat cap boundary', () => {
    expect(getCollisionShapeContainsPoint3D(cylinder, 0, 0, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(cylinder, 1, 2, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(cylinder, 1.01, 0, 0)).toBe(false);
    expect(getCollisionShapeContainsPoint3D(cylinder, 0, 2.01, 0)).toBe(false);
  });

  it('tapers the cone radius toward the apex', () => {
    // Halfway up, the permitted radius is half the base radius. A point at 0.8 is inside the base half
    // and outside the halfway one, which a cylinder test would have accepted at both heights.
    expect(getCollisionShapeContainsPoint3D(cone, 0.8, 0.1, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(cone, 0.8, 1.5, 0)).toBe(false);
    expect(getCollisionShapeContainsPoint3D(cone, 0.7, 1.5, 0)).toBe(true);
  });

  it('places the apex on the boundary and rejects beyond it', () => {
    expect(getCollisionShapeContainsPoint3D(cone, 0, 3, 0)).toBe(true);
    expect(getCollisionShapeContainsPoint3D(cone, 0, 3.01, 0)).toBe(false);
    expect(getCollisionShapeContainsPoint3D(cone, 0, -0.01, 0)).toBe(false);
  });
});

describe('getCollisionShapeValidationStatus3D for cylinder and cone', () => {
  it('rejects a zero-length axis, where a capsule would be valid', () => {
    // A capsule with coincident endpoints is a sphere and stays valid. A cylinder or cone with a
    // zero-length axis is a flat disc whose axis — the thing its support function measures against — is
    // undefined, so the two kinds diverge here on purpose.
    const flat = { kind: 'cylinder', radius: 1, x0: 1, x1: 1, y0: 1, y1: 1, z0: 1, z1: 1 } as const;
    expect(getCollisionShapeValidationStatus3D(flat)).toBe('degenerate-shape');
    expect(getCollisionShapeValidationStatus3D({ ...flat, kind: 'capsule' })).toBeNull();
    expect(
      getCollisionShapeValidationStatus3D({
        apexX: 0,
        apexY: 0,
        apexZ: 0,
        baseX: 0,
        baseY: 0,
        baseZ: 0,
        kind: 'cone',
        radius: 1,
      }),
    ).toBe('degenerate-shape');
  });

  it('accepts well-formed shapes and rejects a non-positive radius', () => {
    expect(getCollisionShapeValidationStatus3D(cylinder)).toBeNull();
    expect(getCollisionShapeValidationStatus3D(cone)).toBeNull();
    expect(getCollisionShapeValidationStatus3D({ ...cylinder, radius: 0 })).toBe('degenerate-shape');
    expect(getCollisionShapeValidationStatus3D({ ...cone, radius: -1 })).toBe('degenerate-shape');
  });
});

describe('raycastCollisionShape3D for cylinder and cone', () => {
  it('hits a cylinder side and reports a radial normal', () => {
    const hit = createCollisionRaycastHit3D();
    expect(raycastCollisionShape3D(cylinder, -5, 0, 0, 1, 0, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(4, 10);
    expect([hit.normalX, hit.normalY, hit.normalZ]).toEqual([-1, 0, 0]);
  });

  it('hits a cylinder cap and reports the axial normal', () => {
    const hit = createCollisionRaycastHit3D();
    expect(raycastCollisionShape3D(cylinder, 0.5, 6, 0, 0, -1, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(4, 10);
    expect([hit.normalX, hit.normalY, hit.normalZ]).toEqual([0, 1, 0]);
  });

  it('misses a cylinder past the cap, where an infinite cylinder would report a hit', () => {
    // Parallel to the cap plane and beyond it. Without the axial slab the quadratic alone would answer
    // this ray, which is the classic infinite-cylinder bug.
    const hit = createCollisionRaycastHit3D();
    expect(raycastCollisionShape3D(cylinder, -5, 3, 0, 1, 0, 0, hit)).toBe(false);
  });

  it('hits a cone side with a normal that leans out by the cone slope', () => {
    const hit = createCollisionRaycastHit3D();
    expect(raycastCollisionShape3D(cone, -5, 1.5, 0, 1, 0, 0, hit)).toBe(true);
    // Halfway up, the surface is at half the base radius.
    expect(hit.fraction).toBeCloseTo(5 - 0.75, 10);
    // The normal must have a POSITIVE axial component: the cone widens toward the base, so its outward
    // surface normal tilts up toward the apex. A bare radial normal would have none.
    expect(hit.normalY).toBeGreaterThan(0);
    expect(Math.hypot(hit.normalX, hit.normalY, hit.normalZ)).toBeCloseTo(1, 10);
  });

  it('does not report a hit on the mirror nappe behind the apex', () => {
    // The lateral quadratic describes a DOUBLE cone. This ray passes well above the apex and meets only
    // the phantom nappe; treating the two roots as an interval would report a hit on a solid that is not
    // there.
    const hit = createCollisionRaycastHit3D();
    expect(raycastCollisionShape3D(cone, -5, 5, 0, 1, 0, 0, hit)).toBe(false);
  });

  it('hits the cone base cap from below', () => {
    const hit = createCollisionRaycastHit3D();
    expect(raycastCollisionShape3D(cone, 0.5, -4, 0, 0, 1, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(4, 10);
    expect([hit.normalX, hit.normalY, hit.normalZ]).toEqual([0, -1, 0]);
  });

  it('matches a brute-force scan of the containment predicate over seeded rays', () => {
    // The property that ties the analytic raycast to an instrument built from different code: the first
    // parameter at which the ray is inside. The scan is coarse, so it can only be trusted to its own step
    // size — which is exactly how it is compared.
    const random = createRandom(99173);
    const hit = createCollisionRaycastHit3D();
    const limit = 12;
    const tolerance = limit / 20000 + 1e-9;
    let hits = 0;
    let misses = 0;

    for (const shape of [cylinder, cone]) {
      for (let i = 0; i < 400; i += 1) {
        const ox = (random() - 0.5) * 10;
        const oy = (random() - 0.5) * 12;
        const oz = (random() - 0.5) * 10;
        if (getCollisionShapeContainsPoint3D(shape, ox, oy, oz)) continue;
        let dx = random() - 0.5;
        let dy = random() - 0.5;
        let dz = random() - 0.5;
        const length = Math.hypot(dx, dy, dz);
        if (!(length > 0)) continue;
        dx /= length;
        dy /= length;
        dz /= length;

        const scanned = findFirstEntryByScanning(shape, ox, oy, oz, dx, dy, dz, limit);
        const analytic = raycastCollisionShape3D(shape, ox, oy, oz, dx, dy, dz, hit, limit);

        if (scanned < 0) {
          // The scan found nothing. The analytic answer may still legitimately clip a corner the scan
          // stepped over, so only a hit well inside the shape would be a real disagreement.
          if (analytic) {
            const inside = getCollisionShapeContainsPoint3D(
              shape,
              ox + dx * (hit.fraction + tolerance * 4),
              oy + dy * (hit.fraction + tolerance * 4),
              oz + dz * (hit.fraction + tolerance * 4),
            );
            expect(
              inside,
              `${shape.kind} ray ${String(i)}: analytic hit at ${String(hit.fraction)} the scan missed`,
            ).toBe(true);
          }
          misses += 1;
          continue;
        }

        expect(analytic, `${shape.kind} ray ${String(i)}: scan entered at ${String(scanned)} but analytic missed`).toBe(
          true,
        );
        expect(
          Math.abs(hit.fraction - scanned),
          `${shape.kind} ray ${String(i)}: analytic ${String(hit.fraction)} vs scan ${String(scanned)}`,
        ).toBeLessThanOrEqual(tolerance);
        hits += 1;
      }
    }

    // Both arms have to have been exercised, or the property proved nothing about either.
    expect(hits).toBeGreaterThan(20);
    expect(misses).toBeGreaterThan(20);
  });
});
