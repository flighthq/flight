import { createVector2 } from '@flighthq/geometry';
import { getPathLength, getPathPositionAtDistance, getPathTangentAtDistance } from '@flighthq/path';
import type { MotionPath, MotionPathLoopMode, Path, Vector2Like } from '@flighthq/types';

// Allocate a `MotionPath` marker at the start of `path` (`distance` 0, `direction` forward).
// `speed` is the traversal rate in path units per second (a magnitude; default 0 = stationary),
// `loopMode` the end behavior (default `clamp`). The path's total arc length is measured once here
// with `getPathLength(path, tolerance)` and cached in `length`; per-frame updates reuse it rather
// than re-measuring. `tolerance` is the curve-flattening tolerance forwarded to the arc-length
// measurement. This is the only allocating function; `updateMotionPath` and the seek helpers write
// into an existing marker.
export function createMotionPath(
  path: Path,
  speed = 0,
  loopMode: MotionPathLoopMode = 'clamp',
  tolerance?: number,
): MotionPath {
  return {
    direction: 1,
    distance: 0,
    length: getPathLength(path, tolerance),
    loopMode,
    path,
    speed,
  };
}

// Return the marker's heading angle in radians — `atan2(tangentY, tangentX)` of the path tangent at
// the current `distance` — for orienting an object along the curve. Samples the tangent into a
// module-scoped scratch vector, so the query allocates nothing. For an empty/degenerate path the
// tangent falls back to `(1, 0)`, giving a heading of 0.
export function getMotionPathHeading(mp: Readonly<MotionPath>): number {
  getPathTangentAtDistance(mp.path, mp.distance, scratchTangent);
  return Math.atan2(scratchTangent.y, scratchTangent.x);
}

const scratchTangent = createVector2();

// Sample the marker's current world position and unit tangent, writing them into `pointOut` and
// `tangentOut`. Returns `true` on success, `false` for an empty/degenerate path (in which case the
// outputs are left unchanged). Delegates to `@flighthq/path`'s `getPathPositionAtDistance` at the
// marker's current `distance`.
export function getMotionPathPosition(
  mp: Readonly<MotionPath>,
  pointOut: Vector2Like,
  tangentOut: Vector2Like,
): boolean {
  return getPathPositionAtDistance(mp.path, mp.distance, pointOut, tangentOut);
}

// Return the marker's normalized progress along the path, `distance / length` in `[0, 1]`. A
// zero-length path reports 0.
export function getMotionPathProgress(mp: Readonly<MotionPath>): number {
  return mp.length > 0 ? mp.distance / mp.length : 0;
}

// Seek the marker to an absolute arc-length `distance`, clamping to the valid `[0, length]` range.
// Does not change `direction` or `speed`.
export function setMotionPathDistance(mp: MotionPath, distance: number): void {
  const length = mp.length;
  let clamped = distance;
  if (clamped < 0) clamped = 0;
  else if (clamped > length) clamped = length;
  mp.distance = clamped;
}

// Seek the marker to a normalized progress `t` along the path, clamping `t` to `[0, 1]` and setting
// `distance` to `t * length`. Does not change `direction` or `speed`.
export function setMotionPathProgress(mp: MotionPath, t: number): void {
  let clamped = t;
  if (clamped < 0) clamped = 0;
  else if (clamped > 1) clamped = 1;
  mp.distance = clamped * mp.length;
}

// Advance `mp` by `deltaTime` seconds: move the marker `speed * deltaTime` path units along its
// current `direction`, then resolve the end behavior (`applyMotionPathLoopMode`). `deltaTime <= 0`
// and a zero-length path are no-ops. `distance` (and, for `pingpong`, `direction`) are updated in
// place; all inputs are read into locals before any write, so `mp` aliasing itself is safe.
export function updateMotionPath(mp: MotionPath, deltaTime: number): void {
  if (deltaTime <= 0) return;
  const length = mp.length;
  if (length <= 0) return;

  // `move` is a magnitude (path units this frame); the travel sign lives in `mp.direction`.
  const move = mp.speed * deltaTime;
  applyMotionPathLoopMode(mp, move, length);
}

// Resolve the end behavior after advancing `mp` by `move` units along `mp.direction`, writing the
// new `distance` (kept in `[0, length]`) and, for `pingpong`, the new `direction` back into `mp`.
//
// `clamp` stops at the ends. `loop` wraps the signed advance modulo `length` into `[0, length)`.
// `pingpong` reflects off both ends: the marker travels on a phase line of period `2 * length`
// whose triangle wave folds back into `[0, length]`, so the closed form below bounces correctly even
// when a single large `move` crosses the path several times. Because `distance` alone is ambiguous
// between the outbound and return legs, the current `direction` selects which phase-line branch the
// marker is on (`direction < 0` mirrors it onto the descending branch) before advancing.
function applyMotionPathLoopMode(mp: MotionPath, move: number, length: number): void {
  const loopMode = mp.loopMode;
  const distance = mp.distance;
  const direction = mp.direction;

  if (loopMode === 'loop') {
    let wrapped = (distance + direction * move) % length;
    if (wrapped < 0) wrapped += length;
    mp.distance = wrapped;
    return;
  }

  if (loopMode === 'pingpong') {
    const period = 2 * length;
    // Phase of the current marker: identity on the outbound (forward) leg, mirrored on the return.
    const phase = direction < 0 ? period - distance : distance;
    let advanced = (phase + move) % period;
    if (advanced < 0) advanced += period;
    if (advanced <= length) {
      mp.distance = advanced;
      mp.direction = 1;
    } else {
      mp.distance = period - advanced;
      mp.direction = -1;
    }
    return;
  }

  // clamp
  let clamped = distance + direction * move;
  if (clamped < 0) clamped = 0;
  else if (clamped > length) clamped = length;
  mp.distance = clamped;
}
