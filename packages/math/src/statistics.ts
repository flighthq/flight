/** Return the arithmetic mean of `values`.
 *
 *  Returns `NaN` for an empty array. No allocation beyond the accumulator.
 */
export function mean(values: Readonly<number[]>): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

/** Return the median of `values`.
 *
 *  Allocates a sorted copy — does not mutate the input. Returns `NaN` for an
 *  empty array.
 */
export function median(values: Readonly<number[]>): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Return the population standard deviation of `values`.
 *
 *  Returns `NaN` for an empty array.
 */
export function standardDeviation(values: Readonly<number[]>): number {
  return Math.sqrt(variance(values));
}

/** Return the population variance of `values`.
 *
 *  Returns `NaN` for an empty array, `0` for a single element.
 */
export function variance(values: Readonly<number[]>): number {
  if (values.length === 0) return NaN;
  const m = mean(values);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - m;
    sum += d * d;
  }
  return sum / values.length;
}

/** Return the weighted average of `values` using `weights`.
 *
 *  Each `values[i]` is weighted by `weights[i]`. The arrays must have the same
 *  length. Returns `NaN` for an empty array or if total weight is `0`. Throws
 *  if `values.length !== weights.length`.
 */
export function weightedAverage(values: Readonly<number[]>, weights: Readonly<number[]>): number {
  if (values.length !== weights.length) {
    throw new RangeError('weightedAverage: values and weights must have the same length');
  }
  if (values.length === 0) return NaN;
  let sumWeights = 0;
  let sumProduct = 0;
  for (let i = 0; i < values.length; i++) {
    sumWeights += weights[i];
    sumProduct += values[i] * weights[i];
  }
  return sumWeights === 0 ? NaN : sumProduct / sumWeights;
}
