// Generated from crates/flight-motionpath/src/motion_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import { createVector2 } from '@flighthq/geometry/contract';
import type { Vector2Like } from '@flighthq/geometry/contract';
import { getPathLength, getPathPositionAtDistance, getPathTangentAtDistance } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

import type { MotionPathDirection, MotionPathLoopMode, MotionPathRaw } from './types.ts';

/**
 * Allocates a motion-path marker at the start of `path` (TS `createMotionPath`): distance 0,
 * direction forward. `speed` is the traversal rate (a magnitude, path units per
 * `updateMotionPath` delta-time unit),
 * `loopMode` the end behavior. The path arc length is measured once with
 * `getPathLength(path, tolerance)` and cached in `length`; `tolerance` is the curve-flattening
 * tolerance forwarded to that measurement. The path handle is retained, not copied.
 */
export function createMotionPath(
  path: Path,
  speed?: number,
  loopMode?: MotionPathLoopMode,
  tolerance?: number,
): MotionPathRaw {
  let out: MotionPathRaw = Object.assign(allocateEntity<MotionPathRaw>(), { distance: 0, length: 0, speed: 0 });
  initializeMotionPath(out, path, speed, loopMode, tolerance);
  return out;
}

/**
 * Returns the marker's heading angle in radians — `atan2(tangentY, tangentX)` of the path tangent
 * at the current distance (TS `getMotionPathHeading`). An empty/degenerate path falls back to the
 * path tangent's `(1, 0)` default, giving a heading of 0.
 */
export function getMotionPathHeading(mp: MotionPathRaw): number {
  let tangent = createVector2(0.0, 0.0);
  getPathTangentAtDistance(mp.path!, mp.distance, tangent, undefined);
  return Math.atan2(tangent.y, tangent.x);
}

/**
 * Resolves the end behavior after advancing `mp` by `move` units along its direction (TS
 * `applyMotionPathLoopMode`). `clamp` stops at the ends; `loop` wraps modulo the length into
 * `[0, length)`; `pingpong` folds a phase line of period `2 * length` back into `[0, length]`, with
 * the current direction selecting the branch, so one large step may cross the path repeatedly.
 */
function applyMotionPathLoopMode(mp: MotionPathRaw, movement: number, length: number): void {
  const loopMode = mp.loopMode;
  const distance = mp.distance;
  const direction = mp.direction;
  if (loopMode === 'loop') {
    let wrapped = (distance + direction * movement) % length;
    if (wrapped < 0.0) {
      wrapped += length;
    }
    mp.distance = wrapped;
    return;
  }
  if (loopMode === 'pingpong') {
    const period = 2.0 * length;
    const phase = direction < 0.0 ? period - distance : distance;
    let advanced = (phase + movement) % period;
    if (advanced < 0.0) {
      advanced += period;
    }
    if (advanced <= length) {
      mp.distance = advanced;
      mp.direction = 1;
    } else {
      mp.distance = period - advanced;
      mp.direction = -1;
    }
    return;
  }
  let clamped = distance + direction * movement;
  if (clamped < 0.0) {
    clamped = 0.0;
  } else {
    if (clamped > length) {
      clamped = length;
    }
  }
  mp.distance = clamped;
}

/**
 * Samples the marker's current world position and unit tangent into `pointOut` and `tangentOut`
 * (TS `getMotionPathPosition`). Returns false for an empty/degenerate path, in which case the point
 * output is left unchanged.
 */
export function getMotionPathPosition(mp: MotionPathRaw, pointOut: Vector2Like, tangentOut: Vector2Like): boolean {
  return getPathPositionAtDistance(mp.path!, mp.distance, pointOut, tangentOut, undefined);
}

/**
 * Returns the marker's normalized progress `distance / length` in `[0, 1]` (TS
 * `getMotionPathProgress`). A zero-length path reports 0.
 */
export function getMotionPathProgress(mp: MotionPathRaw): number {
  return mp.length > 0.0 ? mp.distance / mp.length : 0.0;
}

/**
 * Initializes a motion-path marker under construction (TS `initializeMotionPath`): direction
 * forward, distance 0, the retained `path`, `speed`, `loopMode`, and the arc length measured once
 * with `getPathLength(path, tolerance)`.
 */
export function initializeMotionPath(
  out: MotionPathRaw,
  path: Path,
  speed?: number,
  loopMode?: MotionPathLoopMode,
  tolerance?: number,
): void {
  out.direction = 1;
  out.distance = 0.0;
  out.length = getPathLength(path!, tolerance);
  out.loopMode = loopMode ?? 'clamp';
  out.path = path;
  out.speed = speed ?? 0.0;
}

/**
 * True when the marker sits at the terminal edge for its current direction (TS
 * `isMotionPathAtEnd`).
 */
export function isMotionPathAtEnd(mp: MotionPathRaw): boolean {
  return (() => {
    const matchValue = mp.direction;
    switch (matchValue) {
      case 1:
        return mp.distance >= mp.length;
      case -1:
        return mp.distance <= 0.0;
    }
  })();
}

/**
 * Sets the traversal direction without changing the distance (TS `setMotionPathDirection`).
 */
export function setMotionPathDirection(mp: MotionPathRaw, direction: MotionPathDirection): void {
  mp.direction = direction;
}

/**
 * Seeks the marker to an absolute arc-length distance, clamping to `[0, length]` (TS
 * `setMotionPathDistance`). Direction and speed are unchanged.
 */
export function setMotionPathDistance(mp: MotionPathRaw, distance: number): void {
  let clamped = distance;
  if (clamped < 0.0) {
    clamped = 0.0;
  } else {
    if (clamped > mp.length) {
      clamped = mp.length;
    }
  }
  mp.distance = clamped;
}

/**
 * Seeks the marker to a normalized progress, clamping `t` to `[0, 1]` and setting
 * `distance = t * length` (TS `setMotionPathProgress`). Direction and speed are unchanged.
 */
export function setMotionPathProgress(mp: MotionPathRaw, t: number): void {
  let clamped = t;
  if (clamped < 0.0) {
    clamped = 0.0;
  } else {
    if (clamped > 1.0) {
      clamped = 1.0;
    }
  }
  mp.distance = clamped * mp.length;
}

/**
 * Advances the marker by `deltaTime` milliseconds: moves `speed * deltaTime` path units along the
 * current direction, then resolves the loop mode (TS `updateMotionPath`). A non-positive delta or a
 * zero-length path is a no-op. All inputs are read before any write.
 */
export function updateMotionPath(mp: MotionPathRaw, deltaTime: number): void {
  if (deltaTime <= 0.0) {
    return;
  }
  const length = mp.length;
  if (length <= 0.0) {
    return;
  }
  const movement = mp.speed * deltaTime;
  applyMotionPathLoopMode(mp, movement, length);
}
