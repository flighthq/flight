import type { MotionPath } from '@flighthq/types';

// Seek the marker to an absolute arc-length `distance`, clamping to the valid `[0, length]` range.
// Does not change `direction` or `speed`.
export function setMotionPathDistance(mp: MotionPath, distance: number): void {
  const length = mp.length;
  let clamped = distance;
  if (clamped < 0) clamped = 0;
  else if (clamped > length) clamped = length;
  mp.distance = clamped;
}
