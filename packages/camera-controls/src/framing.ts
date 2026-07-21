import { clamp } from '@flighthq/math';
import type {
  BoundingSphereLike,
  OrbitCameraController,
  OrthographicProjection,
  PerspectiveProjection,
  Projection,
} from '@flighthq/types';

// Frames a non-empty sphere with an orbit controller and active viewport aspect. The target moves to
// the sphere center immediately. Perspective framing changes only `goalDistance`; orthographic
// framing changes only projection half-extents because orbit distance does not affect its visible
// size. Call `snapOrbitCameraController` separately when an immediate perspective dolly is desired.
// Near/far clip planes are never changed. Returns false without mutation for invalid inputs.
export function frameOrbitCameraControllerToSphere(
  controller: OrbitCameraController,
  projection: Projection,
  sphere: Readonly<BoundingSphereLike>,
  aspect: number,
  padding = 1,
): boolean {
  if (!(sphere.radius >= 0) || !(aspect > 0) || !(padding > 0)) return false;

  if (projection.kind === 'perspective') {
    const distance = getPerspectiveFrameDistanceToSphere(projection, sphere.radius, aspect, padding);
    if (!Number.isFinite(distance)) return false;
    controller.goalDistance = clamp(distance, controller.minDistance, controller.maxDistance);
  } else {
    setOrthographicProjectionFrameToSphere(projection, sphere.radius, aspect, padding);
  }

  controller.target.x = sphere.center.x;
  controller.target.y = sphere.center.y;
  controller.target.z = sphere.center.z;
  return true;
}

// Computes the eye-to-center distance that contains a sphere in both dimensions of a perspective
// viewport. `padding` is a radius multiplier (1 is tangent). Clip-plane policy remains with the
// camera owner and is intentionally not hidden here.
export function getPerspectiveFrameDistanceToSphere(
  projection: Readonly<PerspectiveProjection>,
  radius: number,
  aspect: number,
  padding = 1,
): number {
  const paddedRadius = radius * padding;
  const verticalHalfFov = projection.fovY * 0.5;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  return paddedRadius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
}

// Sets orthographic half-extents that contain a sphere without distortion at `aspect`. The tighter
// viewport dimension touches the padded sphere; the other expands to preserve aspect.
export function setOrthographicProjectionFrameToSphere(
  projection: OrthographicProjection,
  radius: number,
  aspect: number,
  padding = 1,
): void {
  const paddedRadius = radius * padding;
  if (aspect >= 1) {
    projection.halfHeight = paddedRadius;
    projection.halfWidth = paddedRadius * aspect;
  } else {
    projection.halfHeight = paddedRadius / aspect;
    projection.halfWidth = paddedRadius;
  }
}
