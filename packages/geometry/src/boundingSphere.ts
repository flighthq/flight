import { createEntity } from '@flighthq/entity';
import type { AabbLike, BoundingSphere, BoundingSphereLike, Matrix4Like, Vector3Like } from '@flighthq/types';

import { createVector3 } from './vector3';

export function cloneBoundingSphere(source: Readonly<BoundingSphereLike>): BoundingSphere {
  return createBoundingSphere(source.center.x, source.center.y, source.center.z, source.radius);
}

/**
 * Copies the center and radius of a bounding sphere.
 *
 * Safe when `out` aliases `source`.
 */
export function copyBoundingSphere(out: BoundingSphereLike, source: Readonly<BoundingSphereLike>): void {
  out.center.x = source.center.x;
  out.center.y = source.center.y;
  out.center.z = source.center.z;
  out.radius = source.radius;
}

/**
 * Creates a bounding sphere from an explicit center and radius. With no arguments the sphere
 * is empty (center at the origin, radius -1).
 */
export function createBoundingSphere(
  centerX?: number,
  centerY?: number,
  centerZ?: number,
  radius?: number,
): BoundingSphere {
  const center = createVector3(centerX ?? 0, centerY ?? 0, centerZ ?? 0);
  return createEntity({ center: center, radius: radius ?? -1 });
}

/**
 * Returns whether a point lies inside (or on the surface of) a bounding sphere. An empty
 * sphere (negative radius) contains no points.
 */
export function getBoundingSphereContainsPoint(
  sphere: Readonly<BoundingSphereLike>,
  point: Readonly<Vector3Like>,
): boolean {
  if (sphere.radius < 0) return false;
  const dx = point.x - sphere.center.x;
  const dy = point.y - sphere.center.y;
  const dz = point.z - sphere.center.z;
  return dx * dx + dy * dy + dz * dz <= sphere.radius * sphere.radius;
}

/**
 * Sets the center and radius of a bounding sphere.
 */
export function setBoundingSphere(
  out: BoundingSphereLike,
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number,
): void {
  out.center.x = centerX;
  out.center.y = centerY;
  out.center.z = centerZ;
  out.radius = radius;
}

/**
 * Writes the bounding sphere that tightly encloses an axis-aligned bounding box: its center
 * is the box center and its radius reaches the box corners. An empty box (min > max) yields
 * an empty sphere (negative radius).
 *
 * Reads `aabb` into locals before writing, so it is safe even if `out` shares vector storage.
 */
export function setBoundingSphereFromAabb(out: BoundingSphereLike, aabb: Readonly<AabbLike>): void {
  const minX = aabb.min.x,
    minY = aabb.min.y,
    minZ = aabb.min.z;
  const maxX = aabb.max.x,
    maxY = aabb.max.y,
    maxZ = aabb.max.z;

  if (minX > maxX || minY > maxY || minZ > maxZ) {
    out.center.x = 0;
    out.center.y = 0;
    out.center.z = 0;
    out.radius = -1;
    return;
  }

  const cx = (minX + maxX) * 0.5,
    cy = (minY + maxY) * 0.5,
    cz = (minZ + maxZ) * 0.5;
  const ex = (maxX - minX) * 0.5,
    ey = (maxY - minY) * 0.5,
    ez = (maxZ - minZ) * 0.5;

  out.center.x = cx;
  out.center.y = cy;
  out.center.z = cz;
  out.radius = Math.sqrt(ex * ex + ey * ey + ez * ez);
}

/**
 * Transforms a bounding sphere by a Matrix4: its center is transformed as a point and its
 * radius is scaled by the largest axis scale of the matrix's linear part, so the result still
 * encloses the transformed sphere under non-uniform scale.
 *
 * Reads `sphere` into locals before writing, so it is safe when `out` aliases `sphere`.
 */
export function transformBoundingSphereByMatrix4(
  out: BoundingSphereLike,
  sphere: Readonly<BoundingSphereLike>,
  m: Readonly<Matrix4Like>,
): void {
  const cx = sphere.center.x,
    cy = sphere.center.y,
    cz = sphere.center.z;
  const radius = sphere.radius;

  const _m = m.m;
  const tcx = _m[0] * cx + _m[4] * cy + _m[8] * cz + _m[12];
  const tcy = _m[1] * cx + _m[5] * cy + _m[9] * cz + _m[13];
  const tcz = _m[2] * cx + _m[6] * cy + _m[10] * cz + _m[14];

  const sx = Math.sqrt(_m[0] * _m[0] + _m[1] * _m[1] + _m[2] * _m[2]);
  const sy = Math.sqrt(_m[4] * _m[4] + _m[5] * _m[5] + _m[6] * _m[6]);
  const sz = Math.sqrt(_m[8] * _m[8] + _m[9] * _m[9] + _m[10] * _m[10]);
  const maxScale = Math.max(sx, sy, sz);

  out.center.x = tcx;
  out.center.y = tcy;
  out.center.z = tcz;
  out.radius = radius < 0 ? radius : radius * maxScale;
}
