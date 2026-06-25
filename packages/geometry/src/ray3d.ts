import { createEntity } from '@flighthq/entity';
import type { AabbLike, BoundingSphereLike, PlaneLike, Ray3D, Ray3DLike, Vector3Like } from '@flighthq/types';

import { createVector3 } from './vector3';

// Creates a Ray3D with an explicit origin and normalized direction. Both vectors are allocated
// fresh. With no arguments the ray sits at the origin pointing in +Z.
export function createRay3D(
  originX?: number,
  originY?: number,
  originZ?: number,
  directionX?: number,
  directionY?: number,
  directionZ?: number,
): Ray3D {
  return createEntity({
    direction: createVector3(directionX ?? 0, directionY ?? 0, directionZ ?? 1),
    origin: createVector3(originX ?? 0, originY ?? 0, originZ ?? 0),
  });
}

/**
 * Writes the closest pair of points between two rays: `outA` receives the point on ray `a`
 * closest to ray `b`, and `outB` the point on ray `b` closest to ray `a`. Both parameters are
 * clamped to `t >= 0` so the result respects ray (half-line) semantics rather than infinite
 * lines. Parallel rays fall back to projecting `b`'s origin onto ray `a`.
 *
 * Directions need not be normalized. Reads all inputs into locals before writing, so it is safe
 * when `outA`/`outB` alias the ray vectors.
 */
export function getClosestPointBetweenRay3Ds(
  outA: Vector3Like,
  outB: Vector3Like,
  a: Readonly<Ray3DLike>,
  b: Readonly<Ray3DLike>,
): void {
  const aox = a.origin.x,
    aoy = a.origin.y,
    aoz = a.origin.z;
  const adx = a.direction.x,
    ady = a.direction.y,
    adz = a.direction.z;
  const box = b.origin.x,
    boy = b.origin.y,
    boz = b.origin.z;
  const bdx = b.direction.x,
    bdy = b.direction.y,
    bdz = b.direction.z;

  // Standard line-line closest-point parameters (Ericson, Real-Time Collision Detection):
  // r = aOrigin - bOrigin, then solve the 2×2 system.
  const aa = adx * adx + ady * ady + adz * adz; // |dirA|^2
  const bb = bdx * bdx + bdy * bdy + bdz * bdz; // |dirB|^2
  const ab = adx * bdx + ady * bdy + adz * bdz; // dirA · dirB
  const rx = aox - box,
    ry = aoy - boy,
    rz = aoz - boz;
  const ar = adx * rx + ady * ry + adz * rz; // dirA · r
  const br = bdx * rx + bdy * ry + bdz * rz; // dirB · r

  const denom = aa * bb - ab * ab;
  let ta: number;
  let tb: number;
  if (denom !== 0) {
    ta = (ab * br - bb * ar) / denom;
  } else {
    // Parallel: anchor on ray a's origin.
    ta = 0;
  }
  if (ta < 0) ta = 0;

  // Recompute tb from the chosen ta, then clamp and re-derive ta if tb was clamped.
  tb = bb !== 0 ? (ab * ta + br) / bb : 0;
  if (tb < 0) {
    tb = 0;
    ta = aa !== 0 ? -ar / aa : 0;
    if (ta < 0) ta = 0;
  }

  outA.x = aox + adx * ta;
  outA.y = aoy + ady * ta;
  outA.z = aoz + adz * ta;
  outB.x = box + bdx * tb;
  outB.y = boy + bdy * tb;
  outB.z = boz + bdz * tb;
}

/**
 * Writes the point on a ray closest to `point`: `point` projected onto the ray and clamped to
 * `t >= 0` so it stays in front of the origin. When `point` projects behind the origin the ray
 * origin is written. Direction need not be normalized.
 *
 * Reads all inputs into locals before writing, so it is safe when `out` aliases `point` or a
 * ray vector.
 */
export function getClosestPointOnRay3D(out: Vector3Like, ray: Readonly<Ray3DLike>, point: Readonly<Vector3Like>): void {
  const ox = ray.origin.x,
    oy = ray.origin.y,
    oz = ray.origin.z;
  const dx = ray.direction.x,
    dy = ray.direction.y,
    dz = ray.direction.z;
  const px = point.x,
    py = point.y,
    pz = point.z;

  const lenSq = dx * dx + dy * dy + dz * dz;
  let t = lenSq !== 0 ? ((px - ox) * dx + (py - oy) * dy + (pz - oz) * dz) / lenSq : 0;
  if (t < 0) t = 0;

  out.x = ox + dx * t;
  out.y = oy + dy * t;
  out.z = oz + dz * t;
}

/**
 * Returns the point on a ray at parameter `t`: `origin + t * direction`. Writes the result to
 * `out`. `t` should be >= 0 for points in front of the origin. There is no bounds check on `t`.
 *
 * Safe when `out` aliases `ray.origin` or `ray.direction`.
 */
export function getRay3DPointAt(out: Vector3Like, ray: Readonly<Ray3DLike>, t: number): void {
  const ox = ray.origin.x,
    oy = ray.origin.y,
    oz = ray.origin.z;
  const dx = ray.direction.x,
    dy = ray.direction.y,
    dz = ray.direction.z;
  out.x = ox + dx * t;
  out.y = oy + dy * t;
  out.z = oz + dz * t;
}

/**
 * Tests whether a ray intersects an axis-aligned bounding box (slab method).
 *
 * Returns the entry parameter `t` (>= 0) on hit, or `-1` on miss. A ray that starts inside the
 * box returns `t = 0`. Direction components need not be normalized; the test works for any
 * non-zero direction. A zero-component direction is handled (the ray is parallel to that slab
 * and outside returns -1, inside continues).
 */
export function intersectRay3DAabb(ray: Readonly<Ray3DLike>, aabb: Readonly<AabbLike>): number {
  const ox = ray.origin.x,
    oy = ray.origin.y,
    oz = ray.origin.z;
  const dx = ray.direction.x,
    dy = ray.direction.y,
    dz = ray.direction.z;

  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;

  // X slab
  if (dx !== 0) {
    const invDx = 1 / dx;
    let t1 = (aabb.min.x - ox) * invDx;
    let t2 = (aabb.max.x - ox) * invDx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  } else if (ox < aabb.min.x || ox > aabb.max.x) {
    return -1;
  }

  // Y slab
  if (dy !== 0) {
    const invDy = 1 / dy;
    let t1 = (aabb.min.y - oy) * invDy;
    let t2 = (aabb.max.y - oy) * invDy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  } else if (oy < aabb.min.y || oy > aabb.max.y) {
    return -1;
  }

  // Z slab
  if (dz !== 0) {
    const invDz = 1 / dz;
    let t1 = (aabb.min.z - oz) * invDz;
    let t2 = (aabb.max.z - oz) * invDz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  } else if (oz < aabb.min.z || oz > aabb.max.z) {
    return -1;
  }

  return tMin;
}

/**
 * Tests whether a ray intersects a plane.
 *
 * Returns the parameter `t` (>= 0) such that `origin + t * direction` lies on the plane, or
 * `-1` if the ray is parallel to the plane (no intersection) or intersects behind the origin.
 * The plane is given in the form `ax + by + cz + d = 0` with a (not necessarily unit) normal.
 *
 * Direction need not be normalized; `t` is in the same units as `direction`.
 */
export function intersectRay3DPlane(ray: Readonly<Ray3DLike>, plane: Readonly<PlaneLike>): number {
  const denom = plane.a * ray.direction.x + plane.b * ray.direction.y + plane.c * ray.direction.z;
  if (Math.abs(denom) < 1e-10) return -1; // parallel
  const t = -(plane.a * ray.origin.x + plane.b * ray.origin.y + plane.c * ray.origin.z + plane.d) / denom;
  return t >= 0 ? t : -1;
}

/**
 * Tests whether a ray intersects a bounding sphere.
 *
 * Returns the parameter `t` of the nearer intersection (>= 0), or `-1` on miss. An empty
 * sphere (radius < 0) always returns `-1`. A ray that starts inside the sphere returns `t = 0`
 * at the entry point (the near intersection is behind the origin; we clamp to `0`).
 *
 * Direction need not be normalized; `t` is in direction units.
 */
export function intersectRay3DSphere(ray: Readonly<Ray3DLike>, sphere: Readonly<BoundingSphereLike>): number {
  if (sphere.radius < 0) return -1;
  const ox = ray.origin.x - sphere.center.x;
  const oy = ray.origin.y - sphere.center.y;
  const oz = ray.origin.z - sphere.center.z;
  const dx = ray.direction.x,
    dy = ray.direction.y,
    dz = ray.direction.z;

  // Quadratic: |d|^2 t^2 + 2(o·d) t + (|o|^2 - r^2) = 0
  const a = dx * dx + dy * dy + dz * dz;
  if (a === 0) return -1; // zero-length direction
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - sphere.radius * sphere.radius;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const sqrtDisc = Math.sqrt(disc);
  const t = (-b - sqrtDisc) / a;
  if (t >= 0) return t;
  // Near intersection was behind origin; try far intersection
  const t2 = (-b + sqrtDisc) / a;
  return t2 >= 0 ? 0 : -1; // inside sphere: return t=0
}

/**
 * Tests whether a ray intersects a triangle using the Möller–Trumbore algorithm.
 *
 * Returns the parameter `t` (>= 0) such that `origin + t * direction` is the hit point, or
 * `-1` on miss (back-face culling is off — both sides are tested). The direction need not be
 * normalized; `t` is in direction units.
 *
 * Also returns `-1` for degenerate triangles (area ≈ 0).
 */
export function intersectRay3DTriangle(
  ray: Readonly<Ray3DLike>,
  a: Readonly<Vector3Like>,
  b: Readonly<Vector3Like>,
  c: Readonly<Vector3Like>,
): number {
  // Edge vectors
  const e1x = b.x - a.x,
    e1y = b.y - a.y,
    e1z = b.z - a.z;
  const e2x = c.x - a.x,
    e2y = c.y - a.y,
    e2z = c.z - a.z;

  const dx = ray.direction.x,
    dy = ray.direction.y,
    dz = ray.direction.z;

  // h = direction × e2
  const hx = dy * e2z - dz * e2y;
  const hy = dz * e2x - dx * e2z;
  const hz = dx * e2y - dy * e2x;

  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-10) return -1; // parallel or degenerate

  const invDet = 1 / det;

  // s = origin - a
  const sx = ray.origin.x - a.x,
    sy = ray.origin.y - a.y,
    sz = ray.origin.z - a.z;

  // u = (s · h) * invDet
  const u = (sx * hx + sy * hy + sz * hz) * invDet;
  if (u < 0 || u > 1) return -1;

  // q = s × e1
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;

  // v = (direction · q) * invDet
  const v = (dx * qx + dy * qy + dz * qz) * invDet;
  if (v < 0 || u + v > 1) return -1;

  // t = (e2 · q) * invDet
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  return t >= 0 ? t : -1;
}

// Writes origin and direction into an existing Ray3D in place.
//
// Safe when `out` aliases an input vector (all inputs are read before writing).
export function setRay3D(out: Ray3DLike, origin: Readonly<Vector3Like>, direction: Readonly<Vector3Like>): void {
  const ox = origin.x,
    oy = origin.y,
    oz = origin.z;
  const dx = direction.x,
    dy = direction.y,
    dz = direction.z;
  out.origin.x = ox;
  out.origin.y = oy;
  out.origin.z = oz;
  out.direction.x = dx;
  out.direction.y = dy;
  out.direction.z = dz;
}
