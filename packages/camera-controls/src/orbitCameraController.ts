import { setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { clamp, damp } from '@flighthq/math';
import type { Camera3D, OrbitCameraController, OrbitCameraControllerOptions } from '@flighthq/types';

// Allocates an orbit controller. `target` defaults to the origin, `distance` to 10, angles to 0;
// `polar` limits default to just inside ±90° so the look-at up vector never degenerates, `distance`
// to (0.01, +∞), and `smoothTime` to 0 (no damping — the camera snaps to the goal each update). The
// current and goal coordinates start equal, so a controller with no verb calls holds a fixed view.
export function createOrbitCameraController(options?: Readonly<OrbitCameraControllerOptions>): OrbitCameraController {
  const azimuth = options?.azimuth ?? 0;
  const polar = options?.polar ?? 0;
  const distance = options?.distance ?? 10;
  const target = options?.target;
  return {
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
  };
}

// Moves the goal distance (dolly / zoom) by `deltaDistance`, clamped to [minDistance, maxDistance].
// Negative moves the eye toward the target.
export function dollyCameraController(controller: OrbitCameraController, deltaDistance: number): void {
  controller.goalDistance = clamp(
    controller.goalDistance + deltaDistance,
    controller.minDistance,
    controller.maxDistance,
  );
}

// Moves the goal orbit angles by the given radian deltas: `deltaAzimuth` rotates horizontally
// (unbounded), `deltaPolar` vertically (clamped to [minPolar, maxPolar]). The app maps a pointer drag
// to these; `updateOrbitCameraController` eases the current angles toward the goal.
export function orbitCameraController(
  controller: OrbitCameraController,
  deltaAzimuth: number,
  deltaPolar: number,
): void {
  controller.goalAzimuth += deltaAzimuth;
  controller.goalPolar = clamp(controller.goalPolar + deltaPolar, controller.minPolar, controller.maxPolar);
}

// Slides the orbit `target` in the view plane: `deltaRight` along the camera's horizontal right axis
// (at the current goal azimuth), `deltaUp` along world-up. Because the eye is derived from the target
// each update, panning the target pans the whole view. Reads the target into locals before writing so
// aliasing is safe.
export function panCameraController(controller: OrbitCameraController, deltaRight: number, deltaUp: number): void {
  const cosAzimuth = Math.cos(controller.goalAzimuth);
  const sinAzimuth = Math.sin(controller.goalAzimuth);
  const target = controller.target;
  target.x += cosAzimuth * deltaRight;
  target.y += deltaUp;
  target.z += -sinAzimuth * deltaRight;
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
    controller.azimuth = damp(controller.azimuth, controller.goalAzimuth, lambda, deltaTime);
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
