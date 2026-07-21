import { setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { clamp, damp } from '@flighthq/math';
import type { Camera3D, FlyCameraController, FlyCameraControllerOptions } from '@flighthq/types';

// Allocates a fly / first-person controller. `position` defaults to the origin, `yaw`/`pitch` to 0
// (looking down -Z), `pitch` limits to just inside ±90° (no gimbal flip), and `smoothTime` to 0 (the
// look angles snap to their goal each update). Current and goal angles start equal.
export function createFlyCameraController(options?: Readonly<FlyCameraControllerOptions>): FlyCameraController {
  const yaw = options?.yaw ?? 0;
  const pitch = options?.pitch ?? 0;
  const position = options?.position;
  return {
    goalPitch: pitch,
    goalYaw: yaw,
    maxPitch: options?.maxPitch ?? DEFAULT_MAX_PITCH,
    minPitch: options?.minPitch ?? DEFAULT_MIN_PITCH,
    pitch,
    position: createVector3(position?.x ?? 0, position?.y ?? 0, position?.z ?? 0),
    smoothTime: options?.smoothTime ?? 0,
    yaw,
  };
}

// Moves the goal look angles by the given radian deltas: `deltaYaw` turns horizontally (unbounded),
// `deltaPitch` looks up/down (clamped to [minPitch, maxPitch]). The app maps a mouse-look delta to
// these; `updateFlyCameraController` eases the current angles toward the goal.
export function lookFlyCameraController(controller: FlyCameraController, deltaYaw: number, deltaPitch: number): void {
  controller.goalYaw += deltaYaw;
  controller.goalPitch = clamp(controller.goalPitch + deltaPitch, controller.minPitch, controller.maxPitch);
}

// Translates `position` along the current heading (immediate, not eased): `forward`/`right` in the
// horizontal plane at the current yaw (so movement stays level regardless of pitch), `up` along
// world-up. The app maps WASD/thrust to these. Reads position into locals before writing so aliasing
// is safe.
export function moveFlyCameraController(
  controller: FlyCameraController,
  forward: number,
  right: number,
  up: number,
): void {
  const sinYaw = Math.sin(controller.yaw);
  const cosYaw = Math.cos(controller.yaw);
  const position = controller.position;
  position.x += sinYaw * forward + cosYaw * right;
  position.y += up;
  position.z += -cosYaw * forward + sinYaw * right;
}

// Advances the controller one step and writes the resulting view into `camera` (in place). Eases the
// current yaw/pitch toward their clamped goals with `@flighthq/math` `damp` (frame-rate independent;
// `smoothTime` <= 0 or `deltaTime` <= 0 snaps), builds the forward direction from the angles, and
// calls look-at from `position` toward `position + forward` with a fixed world-up.
export function updateFlyCameraController(controller: FlyCameraController, camera: Camera3D, deltaTime: number): void {
  const goalPitch = clamp(controller.goalPitch, controller.minPitch, controller.maxPitch);
  if (controller.smoothTime > 0 && deltaTime > 0) {
    const lambda = 1 / controller.smoothTime;
    controller.yaw = damp(controller.yaw, controller.goalYaw, lambda, deltaTime);
    controller.pitch = damp(controller.pitch, goalPitch, lambda, deltaTime);
  } else {
    controller.yaw = controller.goalYaw;
    controller.pitch = goalPitch;
  }

  const cosPitch = Math.cos(controller.pitch);
  const sinPitch = Math.sin(controller.pitch);
  const cosYaw = Math.cos(controller.yaw);
  const sinYaw = Math.sin(controller.yaw);
  const position = controller.position;
  scratchTarget.x = position.x + sinYaw * cosPitch;
  scratchTarget.y = position.y + sinPitch;
  scratchTarget.z = position.z - cosYaw * cosPitch;
  setCamera3DViewMatrix4FromLookAt(camera, position, scratchTarget, WORLD_UP);
}

const DEFAULT_MAX_PITCH = Math.PI / 2 - 0.01;
const DEFAULT_MIN_PITCH = -Math.PI / 2 + 0.01;
const WORLD_UP = createVector3(0, 1, 0);
const scratchTarget = createVector3();
