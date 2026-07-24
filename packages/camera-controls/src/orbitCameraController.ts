import { setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createEntity } from '@flighthq/entity';
import { createVector3 } from '@flighthq/geometry';
import { clamp, damp, deltaAngle } from '@flighthq/math';
import type { Camera3D, OrbitCameraController, OrbitCameraControllerOptions } from '@flighthq/types';

// Allocates an independent Entity containing the same controller value state.
export function cloneOrbitCameraController(source: Readonly<OrbitCameraController>): OrbitCameraController {
  const clone = createOrbitCameraController();
  copyOrbitCameraController(clone, source);
  return clone;
}

// Copies all controller state without sharing its mutable target. Entity runtime/binding state is
// deliberately left on `out`; this is a value-state operation, not an ownership transfer.
export function copyOrbitCameraController(out: OrbitCameraController, source: Readonly<OrbitCameraController>): void {
  out.azimuth = source.azimuth;
  out.distance = source.distance;
  out.goalAzimuth = source.goalAzimuth;
  out.goalDistance = source.goalDistance;
  out.goalPolar = source.goalPolar;
  out.maxDistance = source.maxDistance;
  out.maxPolar = source.maxPolar;
  out.minDistance = source.minDistance;
  out.minPolar = source.minPolar;
  out.polar = source.polar;
  out.smoothTime = source.smoothTime;
  out.target.x = source.target.x;
  out.target.y = source.target.y;
  out.target.z = source.target.z;
}

// Allocates an orbit controller. `target` defaults to the origin, `distance` to 10, angles to 0;
// `polar` limits default to just inside ±90° so the look-at up vector never degenerates, `distance`
// to (0.01, +∞), and `smoothTime` to 0 (no damping — the camera snaps to the goal each update). The
// current and goal coordinates start equal, so a controller with no verb calls holds a fixed view.
export function createOrbitCameraController(options?: Readonly<OrbitCameraControllerOptions>): OrbitCameraController {
  const azimuth = options?.azimuth ?? 0;
  const polar = options?.polar ?? 0;
  const distance = options?.distance ?? 10;
  const target = options?.target;
  return createEntity({
    azimuth,
    distance,
    goalAzimuth: azimuth,
    goalDistance: distance,
    goalPolar: polar,
    maxDistance: options?.maxDistance ?? Number.POSITIVE_INFINITY,
    maxPolar: options?.maxPolar ?? DEFAULT_MAX_POLAR,
    minDistance: options?.minDistance ?? DEFAULT_MIN_DISTANCE,
    minPolar: options?.minPolar ?? DEFAULT_MIN_POLAR,
    polar,
    smoothTime: options?.smoothTime ?? 0,
    target: createVector3(target?.x ?? 0, target?.y ?? 0, target?.z ?? 0),
  });
}

// Moves the goal distance (dolly / zoom) by `deltaDistance`, clamped to [minDistance, maxDistance].
// Negative moves the eye toward the target.
export function dollyOrbitCameraController(controller: OrbitCameraController, deltaDistance: number): void {
  controller.goalDistance = clamp(
    controller.goalDistance + deltaDistance,
    controller.minDistance,
    controller.maxDistance,
  );
}

// Slides the orbit `target` in a world-up plane: `deltaRight` along the camera's horizontal right axis
// (at the current goal azimuth), `deltaUp` along world Y. Because the eye is derived from the target
// each update, panning the target pans the whole view. Reads the target into locals before writing so
// aliasing is safe.
export function panOrbitCameraController(controller: OrbitCameraController, deltaRight: number, deltaUp: number): void {
  const cosAzimuth = Math.cos(controller.goalAzimuth);
  const sinAzimuth = Math.sin(controller.goalAzimuth);
  const target = controller.target;
  target.x += cosAzimuth * deltaRight;
  target.y += deltaUp;
  target.z += -sinAzimuth * deltaRight;
}

// Slides the orbit target in the actual camera view plane. Unlike `panOrbitCameraController`, `deltaUp`
// follows screen-up at the goal polar angle, so it can change all three target coordinates.
export function panOrbitCameraControllerInViewPlane(
  controller: OrbitCameraController,
  deltaRight: number,
  deltaUp: number,
): void {
  const cosAzimuth = Math.cos(controller.goalAzimuth);
  const sinAzimuth = Math.sin(controller.goalAzimuth);
  const cosPolar = Math.cos(controller.goalPolar);
  const sinPolar = Math.sin(controller.goalPolar);
  const target = controller.target;
  target.x += cosAzimuth * deltaRight - sinAzimuth * sinPolar * deltaUp;
  target.y += cosPolar * deltaUp;
  target.z += -sinAzimuth * deltaRight - cosAzimuth * sinPolar * deltaUp;
}

// Restores the controller to constructor defaults or the supplied seed. Current and goal spherical
// coordinates are synchronized, which makes this suitable for scene changes without an eased tail.
export function resetOrbitCameraController(
  controller: OrbitCameraController,
  options?: Readonly<OrbitCameraControllerOptions>,
): void {
  const azimuth = options?.azimuth ?? 0;
  const polar = options?.polar ?? 0;
  const distance = options?.distance ?? 10;
  const target = options?.target;
  controller.azimuth = azimuth;
  controller.distance = distance;
  controller.goalAzimuth = azimuth;
  controller.goalDistance = distance;
  controller.goalPolar = polar;
  controller.maxDistance = options?.maxDistance ?? Number.POSITIVE_INFINITY;
  controller.maxPolar = options?.maxPolar ?? DEFAULT_MAX_POLAR;
  controller.minDistance = options?.minDistance ?? DEFAULT_MIN_DISTANCE;
  controller.minPolar = options?.minPolar ?? DEFAULT_MIN_POLAR;
  controller.polar = polar;
  controller.smoothTime = options?.smoothTime ?? 0;
  controller.target.x = target?.x ?? 0;
  controller.target.y = target?.y ?? 0;
  controller.target.z = target?.z ?? 0;
}

// Moves the goal orbit angles by the given radian deltas: `deltaAzimuth` rotates horizontally
// (unbounded), `deltaPolar` vertically (clamped to [minPolar, maxPolar]). The app maps a pointer drag
// to these; `updateOrbitCameraController` eases the current angles toward the goal.
export function rotateOrbitCameraController(
  controller: OrbitCameraController,
  deltaAzimuth: number,
  deltaPolar: number,
): void {
  controller.goalAzimuth += deltaAzimuth;
  controller.goalPolar = clamp(controller.goalPolar + deltaPolar, controller.minPolar, controller.maxPolar);
}

// Snaps current spherical state to the clamped goal without writing a camera.
export function snapOrbitCameraController(controller: OrbitCameraController): void {
  controller.azimuth = controller.goalAzimuth;
  controller.distance = clamp(controller.goalDistance, controller.minDistance, controller.maxDistance);
  controller.polar = clamp(controller.goalPolar, controller.minPolar, controller.maxPolar);
}

// Advances the controller one step and writes the resulting view into `camera` (in place). Eases the
// current azimuth/polar/distance toward their clamped goals with `@flighthq/math` `damp`
// (frame-rate independent; `smoothTime` <= 0 or `deltaTime` <= 0 snaps), places the eye on the sphere
// around `target`, and calls look-at with a fixed world-up. The polar clamp keeps the eye off the
// poles so the up vector stays valid.
export function updateOrbitCameraController(
  controller: OrbitCameraController,
  camera: Camera3D,
  deltaTime: number,
): void {
  const goalPolar = clamp(controller.goalPolar, controller.minPolar, controller.maxPolar);
  const goalDistance = clamp(controller.goalDistance, controller.minDistance, controller.maxDistance);
  if (controller.smoothTime > 0 && deltaTime > 0) {
    const lambda = 1 / controller.smoothTime;
    const nearestGoalAzimuth = controller.azimuth + deltaAngle(controller.azimuth, controller.goalAzimuth);
    controller.azimuth = damp(controller.azimuth, nearestGoalAzimuth, lambda, deltaTime);
    controller.polar = damp(controller.polar, goalPolar, lambda, deltaTime);
    controller.distance = damp(controller.distance, goalDistance, lambda, deltaTime);
  } else {
    controller.azimuth = controller.goalAzimuth;
    controller.polar = goalPolar;
    controller.distance = goalDistance;
  }

  const cosPolar = Math.cos(controller.polar);
  const sinPolar = Math.sin(controller.polar);
  const cosAzimuth = Math.cos(controller.azimuth);
  const sinAzimuth = Math.sin(controller.azimuth);
  const target = controller.target;
  scratchEye.x = target.x + controller.distance * sinAzimuth * cosPolar;
  scratchEye.y = target.y + controller.distance * sinPolar;
  scratchEye.z = target.z + controller.distance * cosAzimuth * cosPolar;
  setCamera3DViewMatrix4FromLookAt(camera, scratchEye, target, WORLD_UP);
}

const DEFAULT_MAX_POLAR = Math.PI / 2 - 0.01;
const DEFAULT_MIN_DISTANCE = 0.01;
const DEFAULT_MIN_POLAR = -Math.PI / 2 + 0.01;
const WORLD_UP = createVector3(0, 1, 0);
const scratchEye = createVector3();
