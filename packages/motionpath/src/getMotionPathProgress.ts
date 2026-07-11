import type { MotionPath } from '@flighthq/types';

// Return the marker's normalized progress along the path, `distance / length` in `[0, 1]`. A
// zero-length path reports 0.
export function getMotionPathProgress(mp: Readonly<MotionPath>): number {
  return mp.length > 0 ? mp.distance / mp.length : 0;
}
