import { getPathLength } from '@flighthq/path';
import type { MotionPath, MotionPathLoopMode, Path } from '@flighthq/types';

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
