import type { Entity } from './Entity';
import type { Vector3 } from './Vector3';
import type { Vector3Like } from './Vector3';

// A stateful fly / first-person camera controller: plain data holding a world `position` and look
// angles `yaw`/`pitch` (radians). `moveFlyCameraController` translates `position` along the current
// heading (forward/right in the horizontal plane, up along world-Y); `lookFlyCameraController` moves
// the *goal* angles. `updateFlyCameraController` eases the current angles toward the goal each step
// and writes the eye+forward into a pure `Camera3D` view matrix (look-at). Like the orbit controller
// it takes intent deltas, not raw input, so it stays input-agnostic. `pitch` is clamped to
// [`minPitch`, `maxPitch`] (kept just inside ±90° to avoid gimbal flip); `smoothTime` is the
// `@flighthq/math` `damp` time constant for the look angles; <= 0 snaps.
export interface FlyCameraController extends Entity {
  goalPitch: number;
  goalYaw: number;
  maxPitch: number;
  minPitch: number;
  pitch: number;
  position: Vector3;
  smoothTime: number;
  yaw: number;
}

// Structural inputs for `createFlyCameraController`. Every field is optional; omitted fields take the
// documented defaults.
export interface FlyCameraControllerOptions {
  maxPitch?: number;
  minPitch?: number;
  pitch?: number;
  position?: Readonly<Vector3Like>;
  smoothTime?: number;
  yaw?: number;
}
