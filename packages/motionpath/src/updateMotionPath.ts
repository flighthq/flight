import type { MotionPath } from '@flighthq/types';

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
