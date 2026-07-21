import { setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createEntity } from '@flighthq/entity';
import { createVector3 } from '@flighthq/geometry';
import { clamp, damp, deltaAngle } from '@flighthq/math';
import type { Camera3D, FlyCameraController, FlyCameraControllerOptions } from '@flighthq/types';

// Allocates an independent Entity containing the same controller value state.
export function cloneFlyCameraController(source: Readonly<FlyCameraController>): FlyCameraController {
  const clone = createFlyCameraController();
  copyFlyCameraController(clone, source);
  return clone;
}

// Copies all controller state without sharing its mutable position. Entity runtime/binding state is
// deliberately left on `out`; this is a value-state operation, not an ownership transfer.
export function copyFlyCameraController(out: FlyCameraController, source: Readonly<FlyCameraController>): void {
  out.goalPitch = source.goalPitch;
  out.goalYaw = source.goalYaw;
  out.maxPitch = source.maxPitch;
  out.minPitch = source.minPitch;
  out.pitch = source.pitch;
  out.position.x = source.position.x;
  out.position.y = source.position.y;
  out.position.z = source.position.z;
  out.smoothTime = source.smoothTime;
  out.yaw = source.yaw;
}

// Allocates a fly / first-person controller. `position` defaults to the origin, `yaw`/`pitch` to 0
// (looking down -Z), `pitch` limits to just inside ±90° (no gimbal flip), and `smoothTime` to 0 (the
// look angles snap to their goal each update). Current and goal angles start equal.
export function createFlyCameraController(options?: Readonly<FlyCameraControllerOptions>): FlyCameraController {
  const yaw = options?.yaw ?? 0;
  const pitch = options?.pitch ?? 0;
  const position = options?.position;
  return createEntity({
    goalPitch: pitch,
    goalYaw: yaw,
    maxPitch: options?.maxPitch ?? DEFAULT_MAX_PITCH,
    minPitch: options?.minPitch ?? DEFAULT_MIN_PITCH,
    pitch,
    position: createVector3(position?.x ?? 0, position?.y ?? 0, position?.z ?? 0),
    smoothTime: options?.smoothTime ?? 0,
    yaw,
  });
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

// Restores the controller to constructor defaults or the supplied seed. Current and goal angles are
// synchronized, which makes this suitable for scene changes without a one-frame eased transition.
export function resetFlyCameraController(
  controller: FlyCameraController,
  options?: Readonly<FlyCameraControllerOptions>,
): void {
  const yaw = options?.yaw ?? 0;
  const pitch = options?.pitch ?? 0;
  const position = options?.position;
  controller.goalPitch = pitch;
  controller.goalYaw = yaw;
  controller.maxPitch = options?.maxPitch ?? DEFAULT_MAX_PITCH;
  controller.minPitch = options?.minPitch ?? DEFAULT_MIN_PITCH;
  controller.pitch = pitch;
  controller.position.x = position?.x ?? 0;
  controller.position.y = position?.y ?? 0;
  controller.position.z = position?.z ?? 0;
  controller.smoothTime = options?.smoothTime ?? 0;
  controller.yaw = yaw;
}

// Snaps current look state to the clamped goal without writing a camera.
export function snapFlyCameraController(controller: FlyCameraController): void {
  controller.pitch = clamp(controller.goalPitch, controller.minPitch, controller.maxPitch);
  controller.yaw = controller.goalYaw;
}

// Advances the controller one step and writes the resulting view into `camera` (in place). Eases the
// current yaw/pitch toward their clamped goals with `@flighthq/math` `damp` (frame-rate independent;
// `smoothTime` <= 0 or `deltaTime` <= 0 snaps), builds the forward direction from the angles, and
// calls look-at from `position` toward `position + forward` with a fixed world-up.
export function updateFlyCameraController(controller: FlyCameraController, camera: Camera3D, deltaTime: number): void {
  const goalPitch = clamp(controller.goalPitch, controller.minPitch, controller.maxPitch);
  if (controller.smoothTime > 0 && deltaTime > 0) {
    const lambda = 1 / controller.smoothTime;
    const nearestGoalYaw = controller.yaw + deltaAngle(controller.yaw, controller.goalYaw);
    controller.yaw = damp(controller.yaw, nearestGoalYaw, lambda, deltaTime);
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
