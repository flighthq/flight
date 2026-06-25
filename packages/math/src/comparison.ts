import { EPSILON } from './constants';

/** Return `true` if `|a - b| <= epsilon`.
 *
 *  Uses an absolute epsilon, appropriate for values near zero. For magnitudes
 *  much larger than 1, use `approxEqualRelative`. Defaults to the SDK `EPSILON`.
 */
export function approxEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

/** Return `true` if `a` and `b` agree to within a relative tolerance.
 *
 *  Uses `|a - b| <= relativeEpsilon * max(|a|, |b|)`, which scales with
 *  magnitude and is appropriate for large numbers where absolute epsilon
 *  comparisons fail. For values near zero, falls back to `EPSILON`
 *  (absolute). Defaults to `EPSILON` for `relativeEpsilon`.
 */
export function approxEqualRelative(a: number, b: number, relativeEpsilon: number = EPSILON): boolean {
  const diff = Math.abs(a - b);
  const largest = Math.max(Math.abs(a), Math.abs(b));
  return diff <= Math.max(relativeEpsilon * largest, EPSILON);
}

/** Return `true` if `|value| <= epsilon`. */
export function approxZero(value: number, epsilon: number = EPSILON): boolean {
  return Math.abs(value) <= epsilon;
}
