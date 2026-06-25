import { createAabb } from './aabb';
import { createBoundingSphere } from './boundingSphere';
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
