/** Return the arithmetic mean of `values`.
 *
 *  Returns `NaN` for an empty array. No allocation beyond the accumulator.
 */
export function mean(values: Readonly<number[]>): number {
  if (values.length === 0) return NaN;
  const scale = finiteAbsoluteScale(values);
  if (!Number.isFinite(scale)) return unscaledMean(values);
  if (scale === 0) return 0;
  return (scaledSum(values, scale) / values.length) * scale;
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
  return sorted.length % 2 !== 0 ? sorted[mid] : midpoint(sorted[mid - 1], sorted[mid]);
}

/** Return the population standard deviation of `values`.
 *
 *  Returns `NaN` for an empty array.
 */
export function standardDeviation(values: Readonly<number[]>): number {
  if (values.length === 0) return NaN;
  const scale = finiteAbsoluteScale(values);
  if (!Number.isFinite(scale)) return Math.sqrt(unscaledVariance(values));
  if (scale === 0) return 0;
  return Math.sqrt(scaledVariance(values, scale)) * scale;
}

/** Return the population variance of `values`.
 *
 *  Returns `NaN` for an empty array, `0` for a single element.
 */
export function variance(values: Readonly<number[]>): number {
  if (values.length === 0) return NaN;
  const scale = finiteAbsoluteScale(values);
  if (!Number.isFinite(scale)) return unscaledVariance(values);
  if (scale === 0) return 0;
  const normalized = scaledVariance(values, scale);
  if (normalized === 0) return 0;
  return normalized * scale * scale;
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
  const valueScale = finiteAbsoluteScale(values);
  const weightScale = finiteAbsoluteScale(weights);
  if (!Number.isFinite(valueScale) || !Number.isFinite(weightScale)) {
    return unscaledWeightedAverage(values, weights);
  }
  if (weightScale === 0) return NaN;
  const sumWeights = scaledSum(weights, weightScale);
  if (sumWeights === 0) return NaN;
  if (valueScale === 0) return 0;

  let sumProduct = 0;
  let correction = 0;
  for (let i = 0; i < values.length; i++) {
    const term = (values[i] / valueScale) * (weights[i] / weightScale) - correction;
    const next = sumProduct + term;
    correction = next - sumProduct - term;
    sumProduct = next;
  }
  return (sumProduct / sumWeights) * valueScale;
}

function finiteAbsoluteScale(values: Readonly<number[]>): number {
  let scale = 0;
  for (let i = 0; i < values.length; i++) scale = Math.max(scale, Math.abs(values[i]));
  return scale;
}

function midpoint(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return (a + b) / 2;
  if (Object.is(a, b)) return a;
  if ((a >= 0 && b >= 0) || (a <= 0 && b <= 0)) return a + (b - a) / 2;
  return a / 2 + b / 2;
}

function scaledSum(values: Readonly<number[]>, scale: number): number {
  let sum = 0;
  let correction = 0;
  for (let i = 0; i < values.length; i++) {
    const term = values[i] / scale - correction;
    const next = sum + term;
    correction = next - sum - term;
    sum = next;
  }
  return sum;
}

function scaledVariance(values: Readonly<number[]>, scale: number): number {
  const normalizedMean = scaledSum(values, scale) / values.length;
  let sum = 0;
  let correction = 0;
  for (let i = 0; i < values.length; i++) {
    const difference = values[i] / scale - normalizedMean;
    const term = difference * difference - correction;
    const next = sum + term;
    correction = next - sum - term;
    sum = next;
  }
  return Math.max(0, sum / values.length);
}

function unscaledMean(values: Readonly<number[]>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function unscaledVariance(values: Readonly<number[]>): number {
  const average = unscaledMean(values);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const difference = values[i] - average;
    sum += difference * difference;
  }
  return sum / values.length;
}

function unscaledWeightedAverage(values: Readonly<number[]>, weights: Readonly<number[]>): number {
  let sumWeights = 0;
  let sumProduct = 0;
  for (let i = 0; i < values.length; i++) {
    sumWeights += weights[i];
    sumProduct += values[i] * weights[i];
  }
  return sumWeights === 0 ? NaN : sumProduct / sumWeights;
}
