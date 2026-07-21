import { createMatrix4, createVector3, inverseMatrix4, normalizeVector3, subtractVector3 } from '@flighthq/geometry';
import type { Camera3D, Ray3DLike, Vector3Like } from '@flighthq/types';

import { getCamera3DViewProjectionMatrix4 } from './camera';

// Writes the world-space ray from the camera through an NDC screen point (ndcX, ndcY) into
// `out` and returns true, or returns false (leaving `out` untouched) when the view-projection
// is non-invertible. NDC coordinates range from -1 to +1 on both axes (center = 0, top-right =
// (1, 1)). `aspect` is viewport width / height.
//
// The returned ray origin is the near-plane world position and the direction is the normalized
// world-space direction from near through far. Use this for mouse picking, drag raycasts, and
// any screen-to-world query.
//
// Reads all inputs into locals before writing `out`, so it is alias-safe.
export function getCamera3DScreenToWorldRay(
  out: Ray3DLike,
  camera: Readonly<Camera3D>,
  ndcX: number,
  ndcY: number,
  aspect: number,
): boolean {
  getCamera3DViewProjectionMatrix4(__scratchViewProjection, camera, aspect);
  if (!inverseMatrix4(__scratchInverseVP, __scratchViewProjection)) {
    return false;
  }
  const m = __scratchInverseVP.m;
  const nx = ndcX,
    ny = ndcY;
  // Unproject near-plane point (ndcX, ndcY, -1, 1) through the inverse view-projection.
  let nearX = m[0] * nx + m[4] * ny + m[8] * -1 + m[12];
  let nearY = m[1] * nx + m[5] * ny + m[9] * -1 + m[13];
  let nearZ = m[2] * nx + m[6] * ny + m[10] * -1 + m[14];
  const nearW = m[3] * nx + m[7] * ny + m[11] * -1 + m[15];
  if (nearW !== 0) {
    const invW = 1 / nearW;
    nearX *= invW;
    nearY *= invW;
    nearZ *= invW;
  }
  // Unproject far-plane point (ndcX, ndcY, 1, 1).
  let farX = m[0] * nx + m[4] * ny + m[8] + m[12];
  let farY = m[1] * nx + m[5] * ny + m[9] + m[13];
  let farZ = m[2] * nx + m[6] * ny + m[10] + m[14];
  const farW = m[3] * nx + m[7] * ny + m[11] + m[15];
  if (farW !== 0) {
    const invW = 1 / farW;
    farX *= invW;
    farY *= invW;
    farZ *= invW;
  }
  // Direction: from near to far, normalized.
  __scratchNear.x = nearX;
  __scratchNear.y = nearY;
  __scratchNear.z = nearZ;
  __scratchFar.x = farX;
  __scratchFar.y = farY;
  __scratchFar.z = farZ;
  subtractVector3(__scratchDir, __scratchFar, __scratchNear);
  normalizeVector3(__scratchDir, __scratchDir);
  out.origin.x = nearX;
  out.origin.y = nearY;
  out.origin.z = nearZ;
  out.direction.x = __scratchDir.x;
  out.direction.y = __scratchDir.y;
  out.direction.z = __scratchDir.z;
  return true;
}

// Writes the NDC coordinates (x, y ∈ [-1, 1], z = clip-space depth) of a world-space point
// into `out` and returns true, or returns false (leaving `out` untouched) when the point is
// behind the camera (w <= 0) or when the perspective divide yields a degenerate result.
// `aspect` is viewport width / height.
//
// Use this to anchor HUD elements, labels, and gizmos to world positions.
//
// Reads all inputs into locals before writing `out`, so it is alias-safe.
export function getCamera3DWorldToScreen(
  out: Vector3Like,
  camera: Readonly<Camera3D>,
  worldPoint: Readonly<Vector3Like>,
  aspect: number,
): boolean {
  getCamera3DViewProjectionMatrix4(__scratchViewProjection, camera, aspect);
  const m = __scratchViewProjection.m;
  const wx = worldPoint.x,
    wy = worldPoint.y,
    wz = worldPoint.z;
  const clipX = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
  const clipY = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
  const clipZ = m[2] * wx + m[6] * wy + m[10] * wz + m[14];
  const clipW = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
  if (clipW <= 0) {
    return false;
  }
  const invW = 1 / clipW;
  out.x = clipX * invW;
  out.y = clipY * invW;
  out.z = clipZ * invW;
  return true;
}

// Scratch objects reused across calls. Single-threaded; not re-entrant.
const __scratchViewProjection = createMatrix4();
const __scratchInverseVP = createMatrix4();
const __scratchNear = createVector3();
const __scratchFar = createVector3();
const __scratchDir = createVector3();
