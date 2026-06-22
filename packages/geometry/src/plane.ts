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
 * Returns the signed distance from a point to a plane. Positive is the side the normal points
 * toward; assumes the plane normal (a, b, c) is unit length.
 */
export function getPlaneSignedDistanceToPoint(plane: Readonly<PlaneLike>, point: Readonly<Vector3Like>): number {
  return plane.a * point.x + plane.b * point.y + plane.c * point.z + plane.d;
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
