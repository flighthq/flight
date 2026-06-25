import { DEG_TO_RAD, RAD_TO_DEG, TAU } from './constants';

/** Convert `degrees` to radians. */
export function degToRad(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

/** Return the shortest signed difference between angles `from` and `to` (radians).
 *
 *  The result is in `(-π, π]`. Useful for rotating a value toward a target by
 *  the minimum arc.
 */
export function deltaAngle(from: number, to: number): number {
  const diff = (((to - from) % TAU) + TAU) % TAU;
  return diff > Math.PI ? diff - TAU : diff;
}

/** Wrap `radians` to the range `[-π, π)`. */
export function normalizeAngle(radians: number): number {
  const wrapped = ((radians % TAU) + TAU) % TAU;
  return wrapped >= Math.PI ? wrapped - TAU : wrapped;
}

/** Convert `radians` to degrees. */
export function radToDeg(radians: number): number {
  return radians * RAD_TO_DEG;
}
