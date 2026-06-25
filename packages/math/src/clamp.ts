/** Clamp `value` to the inclusive range `[min, max]`.
 *
 *  When `min > max` the result is `min`. NaN propagates unchanged.
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Return `true` if `value` is within the inclusive range `[min, max]`. */
export function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/** Clamp `value` to `[0, 1]`. Equivalent to `clamp(value, 0, 1)`.
 *
 *  Named `saturate` after the GPU HLSL/GLSL convention. Safe in hot loops,
 *  no allocation.
 */
export function saturate(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
