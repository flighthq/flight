import type { BoundingSphereLike, Camera3D, PlaneLike, Ray3DLike, Vector3Like } from '@flighthq/types';

import { getCamera3DScreenToWorldRay, getCamera3DWorldToScreen } from './picking';

// Returns the world-space ray from the camera through the center of a bounding sphere, writing
// the result into `out` and returning true. The ray is suitable for picking and hover-highlight
// queries: it passes through the screen-space projection of the sphere center, and represents
// "the ray a user would cast toward this sphere's center from the camera."
//
// Returns false when:
//   - The sphere is empty (negative radius).
//   - The sphere center is at or behind the camera (w <= 0 in clip space).
//   - The view-projection is non-invertible.
//
// The ray direction is normalized. `aspect` is viewport width / height.
//
// Reads all inputs before writing `out`, so it is alias-safe.
export function getCamera3DRayThroughBoundingSphere(
  out: Ray3DLike,
  camera: Readonly<Camera3D>,
  sphere: Readonly<BoundingSphereLike>,
  aspect: number,
): boolean {
  if (sphere.radius < 0) {
    return false;
  }
  // Project sphere center to NDC.
  if (!getCamera3DWorldToScreen(__scratchNdc, camera, sphere.center, aspect)) {
    return false;
  }
  // Unproject those NDC coords back to a world-space ray.
  return getCamera3DScreenToWorldRay(out, camera, __scratchNdc.x, __scratchNdc.y, aspect);
}

// Computes the intersection of a ray with an infinite plane, writing the hit point into `out`
// and returning true. Returns false when:
//   - The ray direction is parallel to the plane (dot(normal, direction) = 0).
//   - The intersection is behind the ray origin (t < 0).
//   - The plane normal is zero.
//
// The plane is given in the standard Flight form: a·x + b·y + c·z + d = 0. The normal (a, b, c)
// does not need to be unit length. The ray direction does not need to be unit length either.
//
// This is not specific to a camera but lives here as an ergonomic companion to
// `getCamera3DScreenToWorldRay`: cast a ray from mouse position, intersect with a ground plane,
// and you have world-space mouse drag.
//
// Reads all inputs before writing `out`, so it is alias-safe.
export function intersectCamera3DRayWithPlane(
  out: Vector3Like,
  ray: Readonly<Ray3DLike>,
  plane: Readonly<PlaneLike>,
): boolean {
  const dx = ray.direction.x;
  const dy = ray.direction.y;
  const dz = ray.direction.z;
  const ox = ray.origin.x;
  const oy = ray.origin.y;
  const oz = ray.origin.z;
  const a = plane.a;
  const b = plane.b;
  const c = plane.c;
  const d = plane.d;
  // denom = dot(normal, direction)
  const denom = a * dx + b * dy + c * dz;
  if (denom === 0) {
    return false;
  }
  // t = -(dot(normal, origin) + d) / denom
  const t = -(a * ox + b * oy + c * oz + d) / denom;
  if (t < 0) {
    return false;
  }
  // Hit point: origin + t * direction. Read all inputs first (already done into locals above).
  out.x = ox + t * dx;
  out.y = oy + t * dy;
  out.z = oz + t * dz;
  return true;
}

// Scratch for NDC projection result. Single-threaded; not re-entrant.
const __scratchNdc: Vector3Like = { x: 0, y: 0, z: 0 };
