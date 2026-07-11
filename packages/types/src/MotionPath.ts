import type { Path } from './Path';

// Path-following animation header. `@flighthq/motionpath` advances a marker along `path` by ARC
// LENGTH (constant real speed along the curve, not the speed-distorting raw bezier parameter) and
// reports its world position and heading, so a caller can move and orient an object along a curve.
// It is the animation-family driver over `@flighthq/path`'s arc-length sampling: path owns the
// geometry and the "point at distance D" query; motionpath owns the per-frame "where is the marker
// now, and where is it heading, given speed and a loop mode" state.

// How the marker behaves when it reaches an end of the path. `clamp` stops at the ends; `loop` wraps
// modulo the path length (teleporting from end to start); `pingpong` reflects at each end and
// reverses `direction`, so the marker bounces back and forth along the path.
export type MotionPathLoopMode = 'clamp' | 'loop' | 'pingpong';

// A marker's arc-length position and traversal state along a `Path`.
//
// `distance` is the current arc-length position, kept in `[0, length]`; `length` is the path's total
// arc length, cached once at create (see `createMotionPath`). `speed` is the traversal rate in path
// units per second and is a MAGNITUDE — the travel sign lives in `direction` (`1` forward from the
// path start, `-1` backward). Direction is stored rather than folded into a signed speed because
// `pingpong` must remember which way the marker is heading across frames to reflect at the ends;
// `clamp`/`loop` leave `direction` under the caller's control.
export interface MotionPath {
  direction: 1 | -1;
  distance: number;
  length: number;
  loopMode: MotionPathLoopMode;
  path: Path;
  speed: number;
}
