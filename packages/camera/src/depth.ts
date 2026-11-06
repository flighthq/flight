// Generated from crates/flight-camera/src/depth.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { isOrthographicProjection } from './projection.ts';
import type { Camera3D } from './types.ts';

/**
 * Converts a raw NDC depth value (ndcZ in [-1, 1]) to a linear view-space Z (TS
 * `getCamera3DLinearDepth`). Negative values are in front of the camera. Returns 0 for a degenerate
 * clip range or denominator.
 */
export function getCamera3DLinearDepth(camera: Readonly<Camera3D>, ndcZ: number): number {
  const near = camera.near;
  const far = camera.far;
  const range = far - near;
  if (range === 0) {
    return 0;
  }
  if (isOrthographicProjection(camera.projection)) {
    return -(near + ((ndcZ + 1) * range) / 2);
  }
  const denominator = ndcZ * range - (far + near);
  if (denominator === 0) {
    return 0;
  }
  return (2 * far * near) / denominator;
}

/**
 * Converts a raw NDC depth value to a positive linear depth in [near, far] (TS
 * `getCamera3DViewSpaceZ`).
 */
export function getCamera3DViewSpaceZ(camera: Readonly<Camera3D>, ndcZ: number): number {
  return -getCamera3DLinearDepth(camera, ndcZ);
}
