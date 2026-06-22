import { createEntity } from '@flighthq/entity';
import type { AabbLike, Frustum, FrustumLike, Matrix4Like, PlaneLike, Vector3Like } from '@flighthq/types';

import { createPlane } from './plane';

/**
 * Creates a view frustum as six bounding planes, each with an inward-pointing normal. The
 * planes start at zero (a degenerate frustum) and are populated by setFrustumFromMatrix4.
 */
export function createFrustum(): Frustum {
  return createEntity({
    bottom: createPlane(),
    far: createPlane(),
    left: createPlane(),
    near: createPlane(),
    right: createPlane(),
    top: createPlane(),
  });
}

/**
 * Returns whether a point lies inside the frustum. A point is inside when its signed
 * distance to every plane is non-negative (each normal points inward).
 */
export function isFrustumContainingPoint(frustum: Readonly<FrustumLike>, point: Readonly<Vector3Like>): boolean {
  return (
    __planeSignedDistance(frustum.left, point) >= 0 &&
    __planeSignedDistance(frustum.right, point) >= 0 &&
    __planeSignedDistance(frustum.bottom, point) >= 0 &&
    __planeSignedDistance(frustum.top, point) >= 0 &&
    __planeSignedDistance(frustum.near, point) >= 0 &&
    __planeSignedDistance(frustum.far, point) >= 0
  );
}

/**
 * Returns whether an axis-aligned bounding box intersects (or is contained by) the frustum.
 * Uses the conservative positive-vertex test: the box is rejected only when it lies entirely
 * on the outside (negative) side of any single plane. This may report a false positive for
 * boxes straddling a frustum corner but never a false negative.
 */
export function isFrustumIntersectingAabb(frustum: Readonly<FrustumLike>, aabb: Readonly<AabbLike>): boolean {
  return (
    __planeIntersectsAabb(frustum.left, aabb) &&
    __planeIntersectsAabb(frustum.right, aabb) &&
    __planeIntersectsAabb(frustum.bottom, aabb) &&
    __planeIntersectsAabb(frustum.top, aabb) &&
    __planeIntersectsAabb(frustum.near, aabb) &&
    __planeIntersectsAabb(frustum.far, aabb)
  );
}

/**
 * Extracts the six frustum planes from a view-projection Matrix4 (Gribb–Hartmann), each
 * normalized and oriented with an inward-pointing normal. Pass a `view × projection` (or
 * `projection × view`, depending on multiply order) matrix to cull in that space.
 *
 * `out` may be a fresh frustum; the matrix is read-only.
 */
export function setFrustumFromMatrix4(out: FrustumLike, viewProjection: Readonly<Matrix4Like>): void {
  const m = viewProjection.m;
  // Column-major: row r is (m[r], m[4+r], m[8+r], m[12+r]).
  const r00 = m[0],
    r01 = m[4],
    r02 = m[8],
    r03 = m[12];
  const r10 = m[1],
    r11 = m[5],
    r12 = m[9],
    r13 = m[13];
  const r20 = m[2],
    r21 = m[6],
    r22 = m[10],
    r23 = m[14];
  const r30 = m[3],
    r31 = m[7],
    r32 = m[11],
    r33 = m[15];

  __setPlane(out.left, r30 + r00, r31 + r01, r32 + r02, r33 + r03);
  __setPlane(out.right, r30 - r00, r31 - r01, r32 - r02, r33 - r03);
  __setPlane(out.bottom, r30 + r10, r31 + r11, r32 + r12, r33 + r13);
  __setPlane(out.top, r30 - r10, r31 - r11, r32 - r12, r33 - r13);
  __setPlane(out.near, r30 + r20, r31 + r21, r32 + r22, r33 + r23);
  __setPlane(out.far, r30 - r20, r31 - r21, r32 - r22, r33 - r23);
}

// The box intersects (is not fully outside) this plane if its positive vertex — the corner
// farthest along the plane normal — is on the inside (non-negative) side.
function __planeIntersectsAabb(plane: Readonly<PlaneLike>, aabb: Readonly<AabbLike>): boolean {
  const px = plane.a >= 0 ? aabb.max.x : aabb.min.x;
  const py = plane.b >= 0 ? aabb.max.y : aabb.min.y;
  const pz = plane.c >= 0 ? aabb.max.z : aabb.min.z;
  return plane.a * px + plane.b * py + plane.c * pz + plane.d >= 0;
}

function __planeSignedDistance(plane: Readonly<PlaneLike>, point: Readonly<Vector3Like>): number {
  return plane.a * point.x + plane.b * point.y + plane.c * point.z + plane.d;
}

function __setPlane(out: PlaneLike, a: number, b: number, c: number, d: number): void {
  const l = Math.sqrt(a * a + b * b + c * c);
  if (l !== 0) {
    const inv = 1 / l;
    out.a = a * inv;
    out.b = b * inv;
    out.c = c * inv;
    out.d = d * inv;
  } else {
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
  }
}
