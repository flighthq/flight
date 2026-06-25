/** Return the `t` value that maps to `value` in the range `[a, b]`.
 *
 *  The inverse of `lerp`: `inverseLerp(lerp(a, b, t), a, b) === t` when
 *  `a !== b`. Returns `0` when `a === b` to avoid division by zero.
 */
export function inverseLerp(a: number, b: number, value: number): number {
  const range = b - a;
  return range === 0 ? 0 : (value - a) / range;
}

/** Linearly interpolate between `a` and `b` by factor `t`.
 *
 *  `t = 0` returns `a`; `t = 1` returns `b`. `t` is not clamped — pass a
 *  saturated `t` for clamped behaviour. Safe in hot loops, no allocation.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linearly interpolate `value` from `[inMin, inMax]` into `[outMin, outMax]`.
 *
 *  Equivalent to `lerp(outMin, outMax, inverseLerp(inMin, inMax, value))`.
 *  Input range is not clamped. Returns `outMin` when `inMin === inMax`.
 */
export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const inRange = inMax - inMin;
  if (inRange === 0) return outMin;
  return outMin + ((value - inMin) / inRange) * (outMax - outMin);
}

/** Hermite interpolation between `edge0` and `edge1` with a smooth ease curve.
 *
 *  Returns 0 for `x <= edge0`, 1 for `x >= edge1`, and smoothly interpolates
 *  in between using `3t² - 2t³`. This is the same `smoothstep` found in GLSL.
 */
export function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = (x - edge0) / (edge1 - edge0);
  const s = t < 0 ? 0 : t > 1 ? 1 : t;
  return s * s * (3 - 2 * s);
}

/** Returns 0 if `x < edge`, otherwise 1. The scalar step function from GLSL. */
export function step(edge: number, x: number): number {
  return x < edge ? 0 : 1;
}
