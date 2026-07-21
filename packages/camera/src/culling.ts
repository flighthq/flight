import {
  createFrustum,
  createMatrix4,
  isFrustumContainingPoint,
  isFrustumIntersectingAabb,
  isFrustumIntersectingSphere,
  setFrustumFromMatrix4,
} from '@flighthq/geometry';
import type { AabbLike, BoundingSphereLike, Camera3D, FrustumLike, Vector3Like } from '@flighthq/types';

import { getCamera3DViewProjectionMatrix4 } from './camera';

// Extracts the six clip planes of the camera's view frustum into `out` and returns true.
// The planes are normalized with inward-pointing normals (the convention used by geometry's
// isFrustumContainingPoint / isFrustumIntersectingAabb / isFrustumIntersectingSphere).
// `aspect` is viewport width / height.
//
// Use this when you need the raw planes (e.g. to cache the frustum for a frame). For one-shot
// culling queries prefer the isBoxInCamera3DFrustum / isSphereInCamera3DFrustum / isPointInCamera3DFrustum
// helpers which reuse a single scratch frustum.
export function getCamera3DFrustum(out: FrustumLike, camera: Readonly<Camera3D>, aspect: number): void {
  getCamera3DViewProjectionMatrix4(__scratchViewProjection, camera, aspect);
  setFrustumFromMatrix4(out, __scratchViewProjection);
}

// Returns true when an axis-aligned bounding box intersects or is contained by the camera
// frustum. A box outside any frustum plane is rejected. `aspect` is viewport width / height.
//
// Uses the same conservative positive-vertex test as geometry's isFrustumIntersectingAabb:
// may report false positives for boxes straddling a frustum corner, never false negatives.
export function isBoxInCamera3DFrustum(camera: Readonly<Camera3D>, aabb: Readonly<AabbLike>, aspect: number): boolean {
  getCamera3DFrustum(__scratchFrustum, camera, aspect);
  return isFrustumIntersectingAabb(__scratchFrustum, aabb);
}

// Returns true when a world-space point lies inside the camera frustum.
// `aspect` is viewport width / height.
export function isPointInCamera3DFrustum(
  camera: Readonly<Camera3D>,
  point: Readonly<Vector3Like>,
  aspect: number,
): boolean {
  getCamera3DFrustum(__scratchFrustum, camera, aspect);
  return isFrustumContainingPoint(__scratchFrustum, point);
}

// Returns true when a bounding sphere intersects or is contained by the camera frustum.
// An empty sphere (negative radius) always returns false. `aspect` is viewport width / height.
export function isSphereInCamera3DFrustum(
  camera: Readonly<Camera3D>,
  sphere: Readonly<BoundingSphereLike>,
  aspect: number,
): boolean {
  getCamera3DFrustum(__scratchFrustum, camera, aspect);
  return isFrustumIntersectingSphere(__scratchFrustum, sphere);
}

// Scratch objects reused across calls. Single-threaded; not re-entrant.
const __scratchViewProjection = createMatrix4();
const __scratchFrustum = createFrustum();
