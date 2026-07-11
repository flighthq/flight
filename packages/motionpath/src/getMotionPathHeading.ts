import { createVector2 } from '@flighthq/geometry';
import { getPathTangentAtDistance } from '@flighthq/path';
import type { MotionPath } from '@flighthq/types';

// Return the marker's heading angle in radians — `atan2(tangentY, tangentX)` of the path tangent at
// the current `distance` — for orienting an object along the curve. Samples the tangent into a
// module-scoped scratch vector, so the query allocates nothing. For an empty/degenerate path the
// tangent falls back to `(1, 0)`, giving a heading of 0.
export function getMotionPathHeading(mp: Readonly<MotionPath>): number {
  getPathTangentAtDistance(mp.path, mp.distance, scratchTangent);
  return Math.atan2(scratchTangent.y, scratchTangent.x);
}

const scratchTangent = createVector2();
