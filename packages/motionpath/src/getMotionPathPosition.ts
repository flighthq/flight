import { getPathPositionAtDistance } from '@flighthq/path';
import type { MotionPath, Vector2Like } from '@flighthq/types';

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
