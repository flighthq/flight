import { createEntity } from '@flighthq/entity/contract';
import type { Aabb, AabbLike, BoundingSphereLike, Matrix4Like, Vector3Like } from '@flighthq/types/contract';

import { createVector3 } from './vector3';

export function cloneAabb(source: Readonly<AabbLike>): Aabb {
  return createAabb(source.min.x, source.min.y, source.min.z, source.max.x, source.max.y, source.max.z);
}

/**
 * Returns whether a point lies inside (or on the boundary of) an axis-aligned bounding box.
 */
export function containsAabbPoint(aabb: Readonly<AabbLike>, point: Readonly<Vector3Like>): boolean {
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
 * Copies the min and max corners of an axis-aligned bounding box.
 *
 * Safe when `out` aliases `source`.
 */
export function copyAabb(out: AabbLike, source: Readonly<AabbLike>): void {
  const minX = source.min.x,
    minY = source.min.y,
    minZ = source.min.z;
  const maxX = source.max.x,
    maxY = source.max.y,
    maxZ = source.max.z;
  out.min.x = minX;
  out.min.y = minY;
  out.min.z = minZ;
  out.max.x = maxX;
  out.max.y = maxY;
  out.max.z = maxZ;
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
  const minX = aabb.min.x,
    minY = aabb.min.y,
    minZ = aabb.min.z;
  const maxX = aabb.max.x,
    maxY = aabb.max.y,
    maxZ = aabb.max.z;
  const px = point.x,
    py = point.y,
    pz = point.z;
  out.min.x = Math.min(minX, px);
  out.min.y = Math.min(minY, py);
  out.min.z = Math.min(minZ, pz);
  out.max.x = Math.max(maxX, px);
  out.max.y = Math.max(maxY, py);
  out.max.z = Math.max(maxZ, pz);
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
  const minX = aabb.min.x,
    minY = aabb.min.y,
    minZ = aabb.min.z;
  const maxX = aabb.max.x,
    maxY = aabb.max.y,
    maxZ = aabb.max.z;
  const cx = sphere.center.x,
    cy = sphere.center.y,
    cz = sphere.center.z,
    radius = sphere.radius;
  if (radius < 0) {
    // empty sphere — no expansion
    out.min.x = minX;
    out.min.y = minY;
    out.min.z = minZ;
    out.max.x = maxX;
    out.max.y = maxY;
    out.max.z = maxZ;
    return;
  }
  out.min.x = Math.min(minX, cx - radius);
  out.min.y = Math.min(minY, cy - radius);
  out.min.z = Math.min(minZ, cz - radius);
  out.max.x = Math.max(maxX, cx + radius);
  out.max.y = Math.max(maxY, cy + radius);
  out.max.z = Math.max(maxZ, cz + radius);
}

/**
 * Writes the center point of an axis-aligned bounding box (the midpoint of its corners).
 */
export function getAabbCenter(out: Vector3Like, aabb: Readonly<AabbLike>): void {
  const x = (aabb.min.x + aabb.max.x) * 0.5,
    y = (aabb.min.y + aabb.max.y) * 0.5,
    z = (aabb.min.z + aabb.max.z) * 0.5;
  out.x = x;
  out.y = y;
  out.z = z;
}

/**
 * Writes the half-extents (half the size along each axis) of an axis-aligned bounding box.
 */
export function getAabbExtents(out: Vector3Like, aabb: Readonly<AabbLike>): void {
  const x = (aabb.max.x - aabb.min.x) * 0.5,
    y = (aabb.max.y - aabb.min.y) * 0.5,
    z = (aabb.max.z - aabb.min.z) * 0.5;
  out.x = x;
  out.y = y;
  out.z = z;
}

/**
 * Writes the full size (extent along each axis) of an axis-aligned bounding box.
 */
export function getAabbSize(out: Vector3Like, aabb: Readonly<AabbLike>): void {
  const x = aabb.max.x - aabb.min.x,
    y = aabb.max.y - aabb.min.y,
    z = aabb.max.z - aabb.min.z;
  out.x = x;
  out.y = y;
  out.z = z;
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
  const minX = aabb.min.x,
    minY = aabb.min.y,
    minZ = aabb.min.z;
  const maxX = aabb.max.x,
    maxY = aabb.max.y,
    maxZ = aabb.max.z;
  out.x = Math.min(Math.max(px, minX), maxX);
  out.y = Math.min(Math.max(py, minY), maxY);
  out.z = Math.min(Math.max(pz, minZ), maxZ);
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
 * An empty box (min > max on any axis) does not intersect anything.
 */
export function isAabbIntersectingAabb(a: Readonly<AabbLike>, b: Readonly<AabbLike>): boolean {
  if (
    a.min.x > a.max.x ||
    a.min.z > a.max.z ||
    a.min.y > a.max.y ||
    b.min.x > b.max.x ||
    b.min.y > b.max.y ||
    b.min.z > b.max.z
  ) {
    return false;
  }
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
