import { createEntity } from '@flighthq/entity';
import type { Aabb, AabbLike, BoundingSphereLike, Matrix4Like, Vector3Like } from '@flighthq/types';

import { createVector3 } from './vector3';

export function cloneAabb(source: Readonly<AabbLike>): Aabb {
  return createAabb(source.min.x, source.min.y, source.min.z, source.max.x, source.max.y, source.max.z);
}

/**
 * Copies the min and max corners of an axis-aligned bounding box.
 *
 * Safe when `out` aliases `source`.
 */
export function copyAabb(out: AabbLike, source: Readonly<AabbLike>): void {
  out.min.x = source.min.x;
  out.min.y = source.min.y;
  out.min.z = source.min.z;
  out.max.x = source.max.x;
  out.max.y = source.max.y;
  out.max.z = source.max.z;
}

/**
 * Creates an axis-aligned bounding box from explicit min/max corner components. With no
 * arguments the box is empty (min = +Infinity, max = -Infinity) so the first point expanded
 * into it sets both corners.
 */
export function createAabb(
  minX?: number,
  minY?: number,
  minZ?: number,
  maxX?: number,
  maxY?: number,
  maxZ?: number,
): Aabb {
  const min = createVector3(
    minX ?? Number.POSITIVE_INFINITY,
    minY ?? Number.POSITIVE_INFINITY,
    minZ ?? Number.POSITIVE_INFINITY,
  );
  const max = createVector3(
    maxX ?? Number.NEGATIVE_INFINITY,
    maxY ?? Number.NEGATIVE_INFINITY,
    maxZ ?? Number.NEGATIVE_INFINITY,
  );
  return createEntity({ max: max, min: min });
}

/**
 * Grows an axis-aligned bounding box to include a point, writing the result to `out`. When
 * `aabb` is empty (min > max) the first point sets both corners exactly.
 *
 * Safe when `out` aliases `aabb`.
 */
export function expandAabbByPoint(out: AabbLike, aabb: Readonly<AabbLike>, point: Readonly<Vector3Like>): void {
  const px = point.x,
    py = point.y,
    pz = point.z;
  out.min.x = Math.min(aabb.min.x, px);
  out.min.y = Math.min(aabb.min.y, py);
  out.min.z = Math.min(aabb.min.z, pz);
  out.max.x = Math.max(aabb.max.x, px);
  out.max.y = Math.max(aabb.max.y, py);
  out.max.z = Math.max(aabb.max.z, pz);
}

/**
 * Grows an axis-aligned bounding box to include a bounding sphere. The sphere is expanded to
 * its AABB first, then unioned with the existing box.
 *
 * Safe when `out` aliases `aabb`.
 */
export function expandAabbBySphere(
  out: AabbLike,
  aabb: Readonly<AabbLike>,
  sphere: Readonly<BoundingSphereLike>,
): void {
  if (sphere.radius < 0) {
    // empty sphere — no expansion
    out.min.x = aabb.min.x;
    out.min.y = aabb.min.y;
    out.min.z = aabb.min.z;
    out.max.x = aabb.max.x;
    out.max.y = aabb.max.y;
    out.max.z = aabb.max.z;
    return;
  }
  const cx = sphere.center.x,
    cy = sphere.center.y,
    cz = sphere.center.z,
    r = sphere.radius;
  out.min.x = Math.min(aabb.min.x, cx - r);
  out.min.y = Math.min(aabb.min.y, cy - r);
  out.min.z = Math.min(aabb.min.z, cz - r);
  out.max.x = Math.max(aabb.max.x, cx + r);
  out.max.y = Math.max(aabb.max.y, cy + r);
  out.max.z = Math.max(aabb.max.z, cz + r);
}

/**
 * Writes the center point of an axis-aligned bounding box (the midpoint of its corners).
 */
export function getAabbCenter(out: Vector3Like, aabb: Readonly<AabbLike>): void {
  out.x = (aabb.min.x + aabb.max.x) * 0.5;
  out.y = (aabb.min.y + aabb.max.y) * 0.5;
  out.z = (aabb.min.z + aabb.max.z) * 0.5;
}

/**
 * Returns whether a point lies inside (or on the boundary of) an axis-aligned bounding box.
 */
export function getAabbContainsPoint(aabb: Readonly<AabbLike>, point: Readonly<Vector3Like>): boolean {
  return (
    point.x >= aabb.min.x &&
    point.x <= aabb.max.x &&
    point.y >= aabb.min.y &&
    point.y <= aabb.max.y &&
    point.z >= aabb.min.z &&
    point.z <= aabb.max.z
  );
}

/**
 * Writes the half-extents (half the size along each axis) of an axis-aligned bounding box.
 */
export function getAabbExtents(out: Vector3Like, aabb: Readonly<AabbLike>): void {
  out.x = (aabb.max.x - aabb.min.x) * 0.5;
  out.y = (aabb.max.y - aabb.min.y) * 0.5;
  out.z = (aabb.max.z - aabb.min.z) * 0.5;
}

/**
 * Writes the full size (extent along each axis) of an axis-aligned bounding box.
 */
export function getAabbSize(out: Vector3Like, aabb: Readonly<AabbLike>): void {
  out.x = aabb.max.x - aabb.min.x;
  out.y = aabb.max.y - aabb.min.y;
  out.z = aabb.max.z - aabb.min.z;
}

/**
 * Writes the point on (or inside) an axis-aligned bounding box closest to `point` — each
 * coordinate is clamped to the box's range on that axis. When `point` is already inside the box
 * the result equals `point`. An empty box (min > max) clamps to the inverted range and yields a
 * degenerate result; callers should guard empties.
 *
 * Safe when `out` aliases `point`.
 */
export function getClosestPointOnAabb(out: Vector3Like, aabb: Readonly<AabbLike>, point: Readonly<Vector3Like>): void {
  const px = point.x,
    py = point.y,
    pz = point.z;
  out.x = Math.min(Math.max(px, aabb.min.x), aabb.max.x);
  out.y = Math.min(Math.max(py, aabb.min.y), aabb.max.y);
  out.z = Math.min(Math.max(pz, aabb.min.z), aabb.max.z);
}

/**
 * Writes the intersection (overlap region) of two axis-aligned bounding boxes to `out`.
 * If the boxes do not overlap, `out` is set to an empty box (min > max).
 *
 * Reads all inputs into locals before writing, so it is safe when `out` aliases `a` or `b`.
 */
export function intersectAabb(out: AabbLike, a: Readonly<AabbLike>, b: Readonly<AabbLike>): void {
  const aMinX = a.min.x,
    aMinY = a.min.y,
    aMinZ = a.min.z;
  const aMaxX = a.max.x,
    aMaxY = a.max.y,
    aMaxZ = a.max.z;
  const bMinX = b.min.x,
    bMinY = b.min.y,
    bMinZ = b.min.z;
  const bMaxX = b.max.x,
    bMaxY = b.max.y,
    bMaxZ = b.max.z;
  out.min.x = Math.max(aMinX, bMinX);
  out.min.y = Math.max(aMinY, bMinY);
  out.min.z = Math.max(aMinZ, bMinZ);
  out.max.x = Math.min(aMaxX, bMaxX);
  out.max.y = Math.min(aMaxY, bMaxY);
  out.max.z = Math.min(aMaxZ, bMaxZ);
}

/**
 * Returns whether two axis-aligned bounding boxes overlap (share any interior or surface point).
 */
export function isAabbIntersectingAabb(a: Readonly<AabbLike>, b: Readonly<AabbLike>): boolean {
  return (
    a.min.x <= b.max.x &&
    a.max.x >= b.min.x &&
    a.min.y <= b.max.y &&
    a.max.y >= b.min.y &&
    a.min.z <= b.max.z &&
    a.max.z >= b.min.z
  );
}

/**
 * Sets the min and max corners of an axis-aligned bounding box from explicit components.
 */
export function setAabb(
  out: AabbLike,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): void {
  out.min.x = minX;
  out.min.y = minY;
  out.min.z = minZ;
  out.max.x = maxX;
  out.max.y = maxY;
  out.max.z = maxZ;
}

/**
 * Computes the tight axis-aligned bounding box of a set of points. An empty list yields an
 * empty box (min = +Infinity, max = -Infinity).
 */
export function setAabbFromPoints(out: AabbLike, points: Readonly<readonly Readonly<Vector3Like>[]>): void {
  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY,
    maxZ = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }

  out.min.x = minX;
  out.min.y = minY;
  out.min.z = minZ;
  out.max.x = maxX;
  out.max.y = maxY;
  out.max.z = maxZ;
}

/**
 * Transforms an axis-aligned bounding box by a Matrix4 and writes the tight AABB of the
 * transformed box. Uses the center/extent absolute-value method so the result stays
 * axis-aligned in the destination space.
 *
 * Reads all of `aabb` into locals before writing, so it is safe when `out` aliases `aabb`.
 */
export function transformAabbByMatrix4(out: AabbLike, aabb: Readonly<AabbLike>, m: Readonly<Matrix4Like>): void {
  const minX = aabb.min.x,
    minY = aabb.min.y,
    minZ = aabb.min.z;
  const maxX = aabb.max.x,
    maxY = aabb.max.y,
    maxZ = aabb.max.z;

  const cx = (minX + maxX) * 0.5,
    cy = (minY + maxY) * 0.5,
    cz = (minZ + maxZ) * 0.5;
  const ex = (maxX - minX) * 0.5,
    ey = (maxY - minY) * 0.5,
    ez = (maxZ - minZ) * 0.5;

  const _m = m.m;
  // Transformed center (column-major Matrix4, includes translation).
  const tcx = _m[0] * cx + _m[4] * cy + _m[8] * cz + _m[12];
  const tcy = _m[1] * cx + _m[5] * cy + _m[9] * cz + _m[13];
  const tcz = _m[2] * cx + _m[6] * cy + _m[10] * cz + _m[14];

  // Transformed extent via |M| · extent (absolute values of the linear part).
  const tex = Math.abs(_m[0]) * ex + Math.abs(_m[4]) * ey + Math.abs(_m[8]) * ez;
  const tey = Math.abs(_m[1]) * ex + Math.abs(_m[5]) * ey + Math.abs(_m[9]) * ez;
  const tez = Math.abs(_m[2]) * ex + Math.abs(_m[6]) * ey + Math.abs(_m[10]) * ez;

  out.min.x = tcx - tex;
  out.min.y = tcy - tey;
  out.min.z = tcz - tez;
  out.max.x = tcx + tex;
  out.max.y = tcy + tey;
  out.max.z = tcz + tez;
}

/**
 * Writes the union of two axis-aligned bounding boxes — the smallest box enclosing both.
 *
 * Reads both inputs into locals before writing, so it is safe when `out` aliases `a` or `b`.
 */
export function unionAabb(out: AabbLike, a: Readonly<AabbLike>, b: Readonly<AabbLike>): void {
  const aMinX = a.min.x,
    aMinY = a.min.y,
    aMinZ = a.min.z,
    aMaxX = a.max.x,
    aMaxY = a.max.y,
    aMaxZ = a.max.z;
  const bMinX = b.min.x,
    bMinY = b.min.y,
    bMinZ = b.min.z,
    bMaxX = b.max.x,
    bMaxY = b.max.y,
    bMaxZ = b.max.z;

  out.min.x = Math.min(aMinX, bMinX);
  out.min.y = Math.min(aMinY, bMinY);
  out.min.z = Math.min(aMinZ, bMinZ);
  out.max.x = Math.max(aMaxX, bMaxX);
  out.max.y = Math.max(aMaxY, bMaxY);
  out.max.z = Math.max(aMaxZ, bMaxZ);
}
