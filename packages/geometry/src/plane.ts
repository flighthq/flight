import { createEntity } from '@flighthq/entity';
import type { Plane, PlaneLike, Vector3Like } from '@flighthq/types';

export function clonePlane(source: Readonly<PlaneLike>): Plane {
  return createPlane(source.a, source.b, source.c, source.d);
}

/**
 * Copies the coefficients of a plane (a, b, c, d).
 *
 * Safe when `out` aliases `source`.
 */
export function copyPlane(out: PlaneLike, source: Readonly<PlaneLike>): void {
  out.a = source.a;
  out.b = source.b;
  out.c = source.c;
  out.d = source.d;
}

/**
 * Creates a plane in the form a·x + b·y + c·z + d = 0, where (a, b, c) is the plane normal
 * and d is the signed distance from the origin along that normal. Defaults to all zeros (a
 * degenerate plane), populated by the caller or by frustum extraction.
 */
export function createPlane(a?: number, b?: number, c?: number, d?: number): Plane {
  return createEntity({ a: a ?? 0, b: b ?? 0, c: c ?? 0, d: d ?? 0 });
}

/**
 * Writes the point on a plane closest to `point` — `point` projected onto the plane along its
 * normal. Requires the plane normal (a, b, c) to be unit length. This is the closest-point
 * member of the collision-support suite; `projectVector3OntoPlane` performs the identical
 * projection under the projection vocabulary.
 *
 * Safe when `out` aliases `point`.
 */
export function getClosestPointOnPlane(
  out: Vector3Like,
  plane: Readonly<PlaneLike>,
  point: Readonly<Vector3Like>,
): void {
  const px = point.x,
    py = point.y,
    pz = point.z;
  const dist = plane.a * px + plane.b * py + plane.c * pz + plane.d;
  out.x = px - dist * plane.a;
  out.y = py - dist * plane.b;
  out.z = pz - dist * plane.c;
}

/**
 * Writes the coplanar point on the plane closest to the origin.
 * Requires the plane normal (a, b, c) to be unit length.
 */
export function getPlaneCoplanarPoint(out: Vector3Like, plane: Readonly<PlaneLike>): void {
  out.x = -plane.a * plane.d;
  out.y = -plane.b * plane.d;
  out.z = -plane.c * plane.d;
}

/**
 * Returns the signed distance from a point to a plane. Positive is the side the normal points
 * toward; assumes the plane normal (a, b, c) is unit length.
 */
export function getPlaneSignedDistanceToPoint(plane: Readonly<PlaneLike>, point: Readonly<Vector3Like>): number {
  return plane.a * point.x + plane.b * point.y + plane.c * point.z + plane.d;
}

/**
 * Normalizes a plane so its normal (a, b, c) has unit length. The `d` coefficient is scaled
 * proportionally. A degenerate plane (zero-length normal) is written as-is.
 *
 * Safe when `out` aliases `source`.
 */
export function normalizePlane(out: PlaneLike, source: Readonly<PlaneLike>): void {
  const a = source.a,
    b = source.b,
    c = source.c,
    d = source.d;
  const len = Math.sqrt(a * a + b * b + c * c);
  if (len === 0) {
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
    return;
  }
  const inv = 1 / len;
  out.a = a * inv;
  out.b = b * inv;
  out.c = c * inv;
  out.d = d * inv;
}

/**
 * Projects a point onto the plane, writing the closest point on the plane to `out`.
 * Requires the plane normal (a, b, c) to be unit length.
 *
 * Safe when `out` aliases `point`.
 */
export function projectVector3OntoPlane(
  out: Vector3Like,
  point: Readonly<Vector3Like>,
  plane: Readonly<PlaneLike>,
): void {
  const px = point.x,
    py = point.y,
    pz = point.z;
  const dist = plane.a * px + plane.b * py + plane.c * pz + plane.d;
  out.x = px - dist * plane.a;
  out.y = py - dist * plane.b;
  out.z = pz - dist * plane.c;
}

/**
 * Sets the coefficients of a plane (a, b, c, d).
 */
export function setPlane(out: PlaneLike, a: number, b: number, c: number, d: number): void {
  out.a = a;
  out.b = b;
  out.c = c;
  out.d = d;
}

/**
 * Builds a plane from a unit normal and a point that lies on the plane.
 */
export function setPlaneFromNormalAndPoint(
  out: PlaneLike,
  normal: Readonly<Vector3Like>,
  point: Readonly<Vector3Like>,
): void {
  out.a = normal.x;
  out.b = normal.y;
  out.c = normal.z;
  out.d = -(normal.x * point.x + normal.y * point.y + normal.z * point.z);
}

/**
 * Builds a plane from three non-collinear points. The normal direction follows the
 * right-hand rule: counter-clockwise winding when viewed from the positive-normal side.
 *
 * If the points are collinear (degenerate triangle), the plane normal will be zero; use
 * `normalizePlane` to validate after construction if needed.
 *
 * Safe when `out` has no aliasing concerns.
 */
export function setPlaneFromPoints(
  out: PlaneLike,
  a: Readonly<Vector3Like>,
  b: Readonly<Vector3Like>,
  c: Readonly<Vector3Like>,
): void {
  // edge1 = b - a, edge2 = c - a
  const e1x = b.x - a.x,
    e1y = b.y - a.y,
    e1z = b.z - a.z;
  const e2x = c.x - a.x,
    e2y = c.y - a.y,
    e2z = c.z - a.z;
  // normal = cross(e1, e2)
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len === 0) {
    out.a = nx;
    out.b = ny;
    out.c = nz;
    out.d = 0;
    return;
  }
  const inv = 1 / len;
  out.a = nx * inv;
  out.b = ny * inv;
  out.c = nz * inv;
  // d = -dot(normal, a)
  out.d = -(out.a * a.x + out.b * a.y + out.c * a.z);
}
