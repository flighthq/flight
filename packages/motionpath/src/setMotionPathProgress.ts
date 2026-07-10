import type { MotionPath } from '@flighthq/types';

// Seek the marker to a normalized progress `t` along the path, clamping `t` to `[0, 1]` and setting
// `distance` to `t * length`. Does not change `direction` or `speed`.
export function setMotionPathProgress(mp: MotionPath, t: number): void {
  let clamped = t;
  if (clamped < 0) clamped = 0;
  else if (clamped > 1) clamped = 1;
  mp.distance = clamped * mp.length;
}
