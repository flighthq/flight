import type { Camera3D } from '@flighthq/types';

// Converts a raw NDC depth value (ndcZ ∈ [-1, 1]) from the camera's projection back to a linear
// view-space Z value (distance from the camera along its -Z axis). Returns a negative value for a
// point in front of the camera (standard right-handed convention where the camera looks toward -Z).
//
// For perspective projection the NDC depth is non-linear; this undoes that non-linearity using the
// camera's near/far clip planes. Orthographic projection uses its own affine remap.
//
// `ndcZ` should be in [-1, 1] (OpenGL depth convention). Values outside that range are clamped
// mathematically — no explicit clamp is applied; callers should supply valid NDC depths.
//
// Returns 0 when `near` equals `far` (degenerate clip range).
export function getCamera3DLinearDepth(camera: Readonly<Camera3D>, ndcZ: number): number {
  const near = camera.near;
  const far = camera.far;
  const range = far - near;
  if (range === 0) {
    return 0;
  }
  if (camera.projection.kind === 'orthographic') {
    return -(near + ((ndcZ + 1) * range) / 2);
  }
  // Map ndcZ from [-1, 1] back to the view-space Z for a perspective projection.
  // Derived from the perspective depth mapping:
  //   ndcZ = (far + near) / (near - far) + (2 * far * near) / ((near - far) * viewZ)
  // Solving for viewZ:
  //   viewZ = (2 * far * near) / ((ndcZ * (far - near)) - (far + near))
  const denominator = ndcZ * range - (far + near);
  if (denominator === 0) {
    return 0;
  }
  return (2 * far * near) / denominator;
}

// Converts a raw NDC depth value (ndcZ ∈ [-1, 1]) to a positive linear depth in [near, far] —
// the distance along the camera's view axis. This is the unsigned version of getCamera3DLinearDepth,
// useful for fog and SSAO where a positive scalar distance is needed rather than a signed Z.
//
// Returns 0 when `near` equals `far` (degenerate clip range).
export function getCamera3DViewSpaceZ(camera: Readonly<Camera3D>, ndcZ: number): number {
  return -getCamera3DLinearDepth(camera, ndcZ);
}
