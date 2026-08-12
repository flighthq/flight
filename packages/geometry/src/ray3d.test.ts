import { createAabb } from './aabb';
import { createBoundingSphere } from './boundingSphere';
import { createCapsule, intersectRay3DCapsule } from './capsule';
import { createObb, intersectRay3DObb } from './obb';
import { createPlane } from './plane';
import {
  createRay3D,
  getClosestPointBetweenRay3Ds,
  getClosestPointOnRay3D,
  getRay3DPointAt,
  intersectRay3DAabb,
  intersectRay3DPlane,
  intersectRay3DSphere,
  intersectRay3DTriangle,
  setRay3D,
} from './ray3d';
import { createVector3 } from './vector3';

describe('createRay3D', () => {
  it('creates a ray at the origin pointing in +Z by default', () => {
    const ray = createRay3D();
    expect(ray.origin.x).toBe(0);
    expect(ray.origin.y).toBe(0);
    expect(ray.origin.z).toBe(0);
    expect(ray.direction.x).toBe(0);
    expect(ray.direction.y).toBe(0);
    expect(ray.direction.z).toBe(1);
  });

  it('creates a ray with explicit origin and direction', () => {
    const ray = createRay3D(1, 2, 3, 0, 1, 0);
    expect(ray.origin.x).toBe(1);
    expect(ray.origin.y).toBe(2);
    expect(ray.origin.z).toBe(3);
    expect(ray.direction.x).toBe(0);
    expect(ray.direction.y).toBe(1);
    expect(ray.direction.z).toBe(0);
  });
});

describe('getClosestPointBetweenRay3Ds', () => {
  it('finds the closest points between two skew rays', () => {
    // Ray a along +X at the origin; ray b along +Y crossing x=2 at z=1.
    const a = createRay3D(0, 0, 0, 1, 0, 0);
    const b = createRay3D(2, 0, 1, 0, 1, 0);
    const pa = createVector3();
    const pb = createVector3();
    getClosestPointBetweenRay3Ds(pa, pb, a, b);
    expect(pa.x).toBeCloseTo(2, 6);
    expect(pa.y).toBeCloseTo(0, 6);
    expect(pa.z).toBeCloseTo(0, 6);
    expect(pb.x).toBeCloseTo(2, 6);
    expect(pb.y).toBeCloseTo(0, 6);
    expect(pb.z).toBeCloseTo(1, 6);
  });

  it('clamps to the origins when both rays point away from each other', () => {
    const a = createRay3D(0, 0, 0, 1, 0, 0);
    const b = createRay3D(-1, 1, 0, -1, 0, 0);
    const pa = createVector3();
    const pb = createVector3();
    getClosestPointBetweenRay3Ds(pa, pb, a, b);
    expect(pa.x).toBeCloseTo(0, 6);
    expect(pa.y).toBeCloseTo(0, 6);
    expect(pb.x).toBeCloseTo(-1, 6);
    expect(pb.y).toBeCloseTo(1, 6);
  });

  it('handles parallel rays by anchoring on ray a', () => {
    const a = createRay3D(0, 0, 0, 1, 0, 0);
    const b = createRay3D(0, 2, 0, 1, 0, 0);
    const pa = createVector3();
    const pb = createVector3();
    getClosestPointBetweenRay3Ds(pa, pb, a, b);
    // Gap between the parallel rays is 2 along Y.
    expect(Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)).toBeCloseTo(2, 6);
  });

  it('clamps to the origin of the first ray when its nearest approach is behind it', () => {
    // Ray a runs +X from the origin; ray b is a vertical line well behind a's start. The nearest
    // point on a's infinite line is at x = -5, which is not on the ray, so a's origin is the answer.
    const a = createRay3D(0, 0, 0, 1, 0, 0);
    const b = createRay3D(-5, 1, 0, 0, 0, 1);
    const pa = createVector3();
    const pb = createVector3();
    getClosestPointBetweenRay3Ds(pa, pb, a, b);
    expect(pa.x).toBeCloseTo(0, 6);
    expect(pa.y).toBeCloseTo(0, 6);
    expect(pa.z).toBeCloseTo(0, 6);
    expect(pb.x).toBeCloseTo(-5, 6);
    expect(pb.y).toBeCloseTo(1, 6);
    expect(pb.z).toBeCloseTo(0, 6);
  });

  it('clamps both rays to their origins when each nearest approach is behind the other', () => {
    // Both rays head away, so both clamps fire: the second to its origin, and then the first,
    // re-derived from that, to its own.
    const a = createRay3D(5, 0, 0, 1, 0, 0);
    const b = createRay3D(0, 3, 0, 0, 1, 0);
    const pa = createVector3();
    const pb = createVector3();
    getClosestPointBetweenRay3Ds(pa, pb, a, b);
    expect(pa.x).toBeCloseTo(5, 6);
    expect(pa.y).toBeCloseTo(0, 6);
    expect(pb.x).toBeCloseTo(0, 6);
    expect(pb.y).toBeCloseTo(3, 6);
  });

  it('writes finite points when either direction has no length', () => {
    // A direction of zero length gives the solver a zero denominator on both the second and the
    // first ray in turn. Without its guards this writes NaN into the caller's vectors, which is
    // worse than a poor answer because it spreads silently through whatever consumes it.
    const pa = createVector3();
    const pb = createVector3();

    getClosestPointBetweenRay3Ds(pa, pb, createRay3D(0, 0, 0, 1, 0, 0), createRay3D(5, 1, 0, 0, 0, 0));
    expect(Number.isFinite(pa.x) && Number.isFinite(pa.y) && Number.isFinite(pa.z)).toBe(true);
    expect(pb.x).toBe(5);
    expect(pb.y).toBe(1);

    getClosestPointBetweenRay3Ds(pa, pb, createRay3D(0, 0, 0, 0, 0, 0), createRay3D(0, 0, 5, 0, 0, 1));
    expect(pa.x).toBe(0);
    expect(pa.y).toBe(0);
    expect(pa.z).toBe(0);
    expect(Number.isFinite(pb.x) && Number.isFinite(pb.y) && Number.isFinite(pb.z)).toBe(true);
  });
});

describe('getClosestPointOnRay3D', () => {
  it('projects a point onto the ray', () => {
    const ray = createRay3D(0, 0, 0, 1, 0, 0);
    const out = createVector3();
    getClosestPointOnRay3D(out, ray, createVector3(3, 4, 0));
    expect(out.x).toBeCloseTo(3, 6);
    expect(out.y).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('clamps to the origin when the point projects behind it', () => {
    const ray = createRay3D(0, 0, 0, 1, 0, 0);
    const out = createVector3();
    getClosestPointOnRay3D(out, ray, createVector3(-5, 2, 0));
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('works with a non-normalized direction', () => {
    const ray = createRay3D(0, 0, 0, 2, 0, 0);
    const out = createVector3();
    getClosestPointOnRay3D(out, ray, createVector3(3, 7, 0));
    expect(out.x).toBeCloseTo(3, 6);
    expect(out.y).toBeCloseTo(0, 6);
  });

  it('supports out === point', () => {
    const ray = createRay3D(0, 0, 0, 0, 1, 0);
    const p = createVector3(5, 4, 1);
    getClosestPointOnRay3D(p, ray, p);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(4, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('writes the origin for a ray with no direction', () => {
    // A ray with no direction reaches nowhere, so its origin is the only point it has. Dividing
    // by the zero length instead would put NaN in the caller's vector.
    const ray = createRay3D(1, 2, 3, 0, 0, 0);
    const out = createVector3();
    getClosestPointOnRay3D(out, ray, createVector3(9, 9, 9));
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
  });
});

describe('getRay3DPointAt', () => {
  it('returns the origin when t=0', () => {
    const ray = createRay3D(1, 2, 3, 0, 0, 1);
    const out = createVector3();
    getRay3DPointAt(out, ray, 0);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
  });

  it('advances along the direction by t', () => {
    const ray = createRay3D(0, 0, 0, 1, 0, 0);
    const out = createVector3();
    getRay3DPointAt(out, ray, 5);
    expect(out.x).toBe(5);
    expect(out.y).toBe(0);
    expect(out.z).toBe(0);
  });

  it('is safe when out aliases ray.origin', () => {
    const ray = createRay3D(1, 2, 3, 0, 1, 0);
    getRay3DPointAt(ray.origin, ray, 3);
    expect(ray.origin.x).toBe(1);
    expect(ray.origin.y).toBe(5);
    expect(ray.origin.z).toBe(3);
  });
});

describe('intersectRay3DAabb', () => {
  it('returns t=0 when the ray origin is inside the box', () => {
    const ray = createRay3D(0, 0, 0, 0, 0, 1);
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    expect(intersectRay3DAabb(ray, aabb)).toBe(0);
  });

  it('returns the entry t for a ray hitting the box from outside', () => {
    const ray = createRay3D(0, 0, -5, 0, 0, 1);
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    const t = intersectRay3DAabb(ray, aabb);
    expect(t).toBeCloseTo(4);
  });

  it('returns -1 when the ray misses the box', () => {
    const ray = createRay3D(5, 0, -5, 0, 0, 1);
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    expect(intersectRay3DAabb(ray, aabb)).toBe(-1);
  });

  it('returns -1 when the ray points away from the box', () => {
    const ray = createRay3D(0, 0, 5, 0, 0, 1);
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    expect(intersectRay3DAabb(ray, aabb)).toBe(-1);
  });

  it('handles axis-aligned rays', () => {
    const ray = createRay3D(-5, 0, 0, 1, 0, 0);
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    const t = intersectRay3DAabb(ray, aabb);
    expect(t).toBeCloseTo(4);
  });

  it.each([
    ['x', createRay3D(5, 1.5, 1.5, -1, 0, 0), createAabb(2, 1, 1, 1, 2, 2)],
    ['y', createRay3D(1.5, 5, 1.5, 0, -1, 0), createAabb(1, 2, 1, 2, 1, 2)],
    ['z', createRay3D(1.5, 1.5, 5, 0, 0, -1), createAabb(1, 1, 2, 2, 2, 1)],
  ])('returns -1 for an AABB empty on %s', (_axis, ray, empty) => {
    expect(intersectRay3DAabb(ray, empty)).toBe(-1);
  });

  it('returns -1 for a ray with no direction, inside the box or out', () => {
    // A zero-length direction is not a ray, so it never hits anything — the same answer the
    // sphere, capsule, plane and triangle tests give, and not a containment test in disguise.
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    expect(intersectRay3DAabb(createRay3D(0, 0, 0, 0, 0, 0), aabb)).toBe(-1);
    expect(intersectRay3DAabb(createRay3D(5, 0, 0, 0, 0, 0), aabb)).toBe(-1);
  });

  it('enters each of the six sides at that side’s own distance', () => {
    // One slab per axis, written out three times in the source rather than looped, and each one
    // orders its own pair of crossings. A bound picked up from the block above only shows up on
    // the axis it was mistyped on, and only in one direction along it — so the box has six
    // different distances to its sides and each ray is checked against the one it should hit.
    // A cube would hide exactly the mistake this is here to catch.
    const lopsided = createAabb(-1, -4, -6, 2, 3, 5);
    for (const [ox, oy, oz, dx, dy, dz, entry] of RAYS_INTO_LOPSIDED_BOX) {
      expect(intersectRay3DAabb(createRay3D(ox, oy, oz, dx, dy, dz), lopsided)).toBeCloseTo(entry, 6);
    }
  });

  it('returns -1 for a ray aimed away from the box along any axis', () => {
    // Same six positions, turned around. The box is behind the origin, so both crossings are
    // behind it and the slab that owns that axis is the one that has to reject.
    const lopsided = createAabb(-1, -4, -6, 2, 3, 5);
    for (const [ox, oy, oz, dx, dy, dz] of RAYS_INTO_LOPSIDED_BOX) {
      expect(intersectRay3DAabb(createRay3D(ox, oy, oz, -dx, -dy, -dz), lopsided)).toBe(-1);
    }
  });

  it('returns -1 for a ray running alongside the box on any axis', () => {
    // No motion on one axis and outside the box on it: the ray stays level with the box forever
    // and never enters, which each slab has to catch without a crossing to compute.
    const lopsided = createAabb(-1, -4, -6, 2, 3, 5);
    expect(intersectRay3DAabb(createRay3D(10, 0, 0, 0, 1, 0), lopsided)).toBe(-1);
    expect(intersectRay3DAabb(createRay3D(0, 10, 0, 0, 0, 1), lopsided)).toBe(-1);
    expect(intersectRay3DAabb(createRay3D(0, 0, 10, 1, 0, 0), lopsided)).toBe(-1);
  });
});

describe('intersectRay3DPlane', () => {
  it('returns the t of a simple XY-plane intersection', () => {
    // Plane z=0, i.e. 0x + 0y + 1z + 0 = 0
    const plane = createPlane(0, 0, 1, 0);
    const ray = createRay3D(0, 0, -3, 0, 0, 1);
    expect(intersectRay3DPlane(ray, plane)).toBeCloseTo(3);
  });

  it('returns -1 when ray is parallel to the plane', () => {
    const plane = createPlane(0, 0, 1, 0);
    const ray = createRay3D(0, 0, 1, 1, 0, 0);
    expect(intersectRay3DPlane(ray, plane)).toBe(-1);
  });

  it('returns -1 when intersection is behind the origin', () => {
    const plane = createPlane(0, 0, 1, 0);
    const ray = createRay3D(0, 0, 3, 0, 0, 1); // pointing away from z=0
    expect(intersectRay3DPlane(ray, plane)).toBe(-1);
  });

  it.each([1, 1e-6, 1e-12])('is invariant when the plane equation is scaled by %s', (scale) => {
    const plane = createPlane(0, 0, scale, 3 * scale);
    const ray = createRay3D(0, 0, -6, 0, 0, 2);
    expect(intersectRay3DPlane(ray, plane)).toBeCloseTo(1.5, 10);
  });

  it('returns -1 for a zero normal or zero direction', () => {
    expect(intersectRay3DPlane(createRay3D(0, 0, -3, 0, 0, 1), createPlane())).toBe(-1);
    expect(intersectRay3DPlane(createRay3D(0, 0, -3, 0, 0, 0), createPlane(0, 0, 1, 0))).toBe(-1);
  });
});

describe('intersectRay3DSphere', () => {
  it('returns the near t for a ray hitting the sphere', () => {
    const sphere = createBoundingSphere(0, 0, 0, 1);
    const ray = createRay3D(0, 0, -5, 0, 0, 1);
    const t = intersectRay3DSphere(ray, sphere);
    expect(t).toBeCloseTo(4);
  });

  it('returns 0 when the ray origin is inside the sphere', () => {
    const sphere = createBoundingSphere(0, 0, 0, 2);
    const ray = createRay3D(0, 0, 0, 0, 0, 1);
    expect(intersectRay3DSphere(ray, sphere)).toBe(0);
  });

  it('returns -1 when the ray misses the sphere', () => {
    const sphere = createBoundingSphere(0, 0, 0, 1);
    const ray = createRay3D(5, 0, -5, 0, 0, 1);
    expect(intersectRay3DSphere(ray, sphere)).toBe(-1);
  });

  it('returns -1 for an empty sphere (radius < 0)', () => {
    const sphere = createBoundingSphere(0, 0, 0, -1);
    const ray = createRay3D(0, 0, -5, 0, 0, 1);
    expect(intersectRay3DSphere(ray, sphere)).toBe(-1);
  });

  it('returns -1 when the sphere is squarely behind the ray', () => {
    // Aimed away rather than off to one side: the line through the ray does cross the sphere, so
    // this is not the miss the other test covers — both crossings are simply behind the origin.
    const sphere = createBoundingSphere(0, 0, 0, 1);
    expect(intersectRay3DSphere(createRay3D(5, 0, 0, 1, 0, 0), sphere)).toBe(-1);
  });

  it('returns -1 for a ray with no direction', () => {
    const sphere = createBoundingSphere(0, 0, 0, 1);
    expect(intersectRay3DSphere(createRay3D(0, 0, 0, 0, 0, 0), sphere)).toBe(-1);
  });
});

describe('intersectRay3DTriangle', () => {
  const a = { x: -1, y: 0, z: 0 };
  const b = { x: 1, y: 0, z: 0 };
  const c = { x: 0, y: 1, z: 0 };

  it('returns the t for a ray hitting the triangle', () => {
    const ray = createRay3D(0, 0.3, -3, 0, 0, 1);
    const t = intersectRay3DTriangle(ray, a, b, c);
    expect(t).toBeCloseTo(3);
  });

  it('returns -1 when the ray misses the triangle', () => {
    const ray = createRay3D(5, 5, -3, 0, 0, 1);
    expect(intersectRay3DTriangle(ray, a, b, c)).toBe(-1);
  });

  it('returns -1 when the ray hits behind the origin', () => {
    const ray = createRay3D(0, 0.3, 3, 0, 0, 1); // pointing away
    expect(intersectRay3DTriangle(ray, a, b, c)).toBe(-1);
  });

  it('tests both sides of the triangle (no back-face culling)', () => {
    // From behind the triangle
    const ray = createRay3D(0, 0.3, 3, 0, 0, -1);
    const t = intersectRay3DTriangle(ray, a, b, c);
    expect(t).toBeCloseTo(3);
  });

  it('returns -1 for a degenerate (zero-area) triangle', () => {
    const p = { x: 0, y: 0, z: 0 };
    const ray = createRay3D(0, 0, -1, 0, 0, 1);
    expect(intersectRay3DTriangle(ray, p, p, p)).toBe(-1);
  });

  it.each([1, 1e-6, 1e-12])('accepts a non-normalized direction scaled by %s', (scale) => {
    const ray = createRay3D(0, 0.3, -3, 0, 0, scale);
    expect(intersectRay3DTriangle(ray, a, b, c) * scale).toBeCloseTo(3, 10);
  });

  it.each([1, 1e-3, 1e-6])('does not treat a triangle scaled by %s as degenerate', (scale) => {
    const scaledA = { x: -scale, y: 0, z: 0 };
    const scaledB = { x: scale, y: 0, z: 0 };
    const scaledC = { x: 0, y: scale, z: 0 };
    const ray = createRay3D(0, 0.3 * scale, -3, 0, 0, 1);
    expect(intersectRay3DTriangle(ray, scaledA, scaledB, scaledC)).toBeCloseTo(3, 10);
  });

  it('returns -1 for a zero direction', () => {
    expect(intersectRay3DTriangle(createRay3D(0, 0.3, -3, 0, 0, 0), a, b, c)).toBe(-1);
  });

  it('returns -1 for a nonzero direction nearly parallel to the triangle', () => {
    const nearlyParallel = createRay3D(-1, 0.3, -1e-12, 1, 0, 1e-12);
    expect(intersectRay3DTriangle(nearlyParallel, a, b, c)).toBe(-1);
  });

  it('returns -1 for points inside the triangle’s span but past its far edge', () => {
    // The triangle covers x in [-1, 1] along the base and rises to (0, 1). A ray through
    // (0.9, 0.9) lands in the corner the hypotenuse cuts off: within the reach of both edges
    // measured from the first corner, but outside the triangle itself.
    const ray = createRay3D(0.9, 0.9, -3, 0, 0, 1);
    expect(intersectRay3DTriangle(ray, a, b, c)).toBe(-1);
  });

  it('returns -1 for points on the far side of the base', () => {
    const ray = createRay3D(0, -0.5, -3, 0, 0, 1);
    expect(intersectRay3DTriangle(ray, a, b, c)).toBe(-1);
  });

  it('returns -1 for points beyond either end of the first edge', () => {
    // Off the end of the base in each direction. These are rejected on the first barycentric
    // coordinate, before the second is worked out at all — a different rejection from the two
    // above, and the one that stops a point way off the triangle being measured against its far
    // edge as though it were nearby.
    expect(intersectRay3DTriangle(createRay3D(3, 0, -3, 0, 0, 1), a, b, c)).toBe(-1);
    expect(intersectRay3DTriangle(createRay3D(0, 3, -3, 0, 0, 1), a, b, c)).toBe(-1);
  });
});

describe('ray-shape direction scale parity', () => {
  it.each([1, 1e-6, 1e-12])('preserves the hit point across all six shapes at scale %s', (scale) => {
    const ray = createRay3D(5, 0, 0, -scale, 0, 0);
    const hits = [
      intersectRay3DAabb(ray, createAabb(-1, -1, -1, 1, 1, 1)),
      intersectRay3DSphere(ray, createBoundingSphere(0, 0, 0, 1)),
      intersectRay3DCapsule(ray, createCapsule(0, -1, 0, 0, 1, 0, 1)),
      intersectRay3DObb(ray, createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1)),
      intersectRay3DPlane(ray, createPlane(1, 0, 0, -1)),
      intersectRay3DTriangle(ray, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: 0, z: 1 }),
    ];

    for (const t of hits) expect(t * scale).toBeCloseTo(4, 10);
  });
});

describe('setRay3D', () => {
  it('writes origin and direction into an existing ray', () => {
    const ray = createRay3D();
    const origin = { x: 4, y: 5, z: 6 };
    const direction = { x: 0, y: 0, z: -1 };
    setRay3D(ray, origin, direction);
    expect(ray.origin.x).toBe(4);
    expect(ray.origin.y).toBe(5);
    expect(ray.origin.z).toBe(6);
    expect(ray.direction.x).toBe(0);
    expect(ray.direction.y).toBe(0);
    expect(ray.direction.z).toBe(-1);
  });

  it('is safe when origin aliases the ray origin', () => {
    const ray = createRay3D(1, 2, 3, 0, 1, 0);
    const direction = { x: 1, y: 0, z: 0 };
    setRay3D(ray, ray.origin, direction);
    expect(ray.origin.x).toBe(1);
    expect(ray.origin.y).toBe(2);
    expect(ray.origin.z).toBe(3);
    expect(ray.direction.x).toBe(1);
    expect(ray.direction.y).toBe(0);
    expect(ray.direction.z).toBe(0);
  });

  it('is safe when direction aliases the ray direction', () => {
    const ray = createRay3D(0, 0, 0, 0, 1, 0);
    const origin = { x: 5, y: 6, z: 7 };
    setRay3D(ray, origin, ray.direction);
    expect(ray.origin.x).toBe(5);
    expect(ray.origin.y).toBe(6);
    expect(ray.origin.z).toBe(7);
    expect(ray.direction.x).toBe(0);
    expect(ray.direction.y).toBe(1);
    expect(ray.direction.z).toBe(0);
  });
});

// Six rays, one per side of the box spanning (-1, -4, -6) to (2, 3, 5), each starting 10 units out
// along an axis and aimed at it. The last number is where that ray meets the box: all six differ,
// so a slab reading another axis' bound gives a different answer rather than the same one.
// Reversing the direction of each turns the set into six rays aimed away from the box.
const RAYS_INTO_LOPSIDED_BOX: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
  [-10, 0, 0, 1, 0, 0, 9],
  [10, 0, 0, -1, 0, 0, 8],
  [0, -10, 0, 0, 1, 0, 6],
  [0, 10, 0, 0, -1, 0, 7],
  [0, 0, -10, 0, 0, 1, 4],
  [0, 0, 10, 0, 0, -1, 5],
];
