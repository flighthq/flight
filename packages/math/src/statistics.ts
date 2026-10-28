// Generated from crates/flight-math/src/statistics.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

function finiteAbsoluteScale(values: Readonly<number[]>): number {
  let scale = 0.0;
  let i = 0;
  while (i < values.length) {
    const v = Math.abs(values[i]);
    if (Number.isNaN(v)) {
      return Number.NaN;
    }
    if (v > scale) {
      scale = v;
    }
    i += 1;
  }
  return scale;
}

/**
 * Return the arithmetic mean of `values`.
 *
 * Returns `NaN` for empty input. No allocation beyond the accumulator.
 */
export function mean(values: Readonly<number[]>): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const scale = finiteAbsoluteScale(values);
  if (!Number.isFinite(scale)) {
    return unscaledMean(values);
  }
  if (scale === 0.0) {
    return 0.0;
  }
  return (scaledSum(values, scale) / values.length) * scale;
}

/**
 * Return the median of `values`.
 *
 * Allocates a sorted copy — does not mutate the input. Returns `NaN` for an
 * empty input.
 */
export function median(values: Readonly<number[]>): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  let sorted = [...values];
  sorted.sort((a, b) => a - b);
  const mid = Math.trunc(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : midpoint(sorted[mid - 1], sorted[mid]);
}

function midpoint(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return (a + b) / 2.0;
  }
  if (Object.is(a, b)) {
    return a;
  }
  if ((a >= 0.0 && b >= 0.0) || (a <= 0.0 && b <= 0.0)) {
    return a + (b - a) / 2.0;
  }
  return a / 2.0 + b / 2.0;
}

function scaledSum(values: Readonly<number[]>, scale: number): number {
  let sum = 0.0;
  let correction = 0.0;
  let i = 0;
  while (i < values.length) {
    const term = values[i] / scale - correction;
    const next = sum + term;
    correction = next - sum - term;
    sum = next;
    i += 1;
  }
  return sum;
}

function scaledVariance(values: Readonly<number[]>, scale: number): number {
  const normalizedMean = scaledSum(values, scale) / values.length;
  let sum = 0.0;
  let correction = 0.0;
  let i = 0;
  while (i < values.length) {
    const difference = values[i] / scale - normalizedMean;
    const term = difference * difference - correction;
    const next = sum + term;
    correction = next - sum - term;
    sum = next;
    i += 1;
  }
  return sum / values.length > 0.0 ? sum / values.length : 0.0;
}

/**
 * Return the population standard deviation of `values`.
 *
 * Returns `NaN` for empty input.
 */
export function standardDeviation(values: Readonly<number[]>): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const scale = finiteAbsoluteScale(values);
  if (!Number.isFinite(scale)) {
    return Math.sqrt(unscaledVariance(values));
  }
  if (scale === 0.0) {
    return 0.0;
  }
  return Math.sqrt(scaledVariance(values, scale)) * scale;
}

function unscaledMean(values: Readonly<number[]>): number {
  let sum = 0.0;
  let i = 0;
  while (i < values.length) {
    sum += values[i];
    i += 1;
  }
  return sum / values.length;
}

function unscaledVariance(values: Readonly<number[]>): number {
  const average = unscaledMean(values);
  let sum = 0.0;
  let i = 0;
  while (i < values.length) {
    const difference = values[i] - average;
    sum += difference * difference;
    i += 1;
  }
  return sum / values.length;
}

function unscaledWeightedAverage(values: Readonly<number[]>, weights: Readonly<number[]>): number {
  let sumWeights = 0.0;
  let sumProduct = 0.0;
  let i = 0;
  while (i < values.length) {
    sumWeights += weights[i];
    sumProduct += values[i] * weights[i];
    i += 1;
  }
  return sumWeights === 0.0 ? Number.NaN : sumProduct / sumWeights;
}

/**
 * Return the population variance of `values`.
 *
 * Returns `NaN` for empty input, `0` for a single element.
 */
export function variance(values: Readonly<number[]>): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const scale = finiteAbsoluteScale(values);
  if (!Number.isFinite(scale)) {
    return unscaledVariance(values);
  }
  if (scale === 0.0) {
    return 0.0;
  }
  const normalized = scaledVariance(values, scale);
  if (normalized === 0.0) {
    return 0.0;
  }
  return normalized * scale * scale;
}

/**
 * Return the weighted average of `values` using `weights`.
 *
 * Each `values[i]` is weighted by `weights[i]`. The inputs must have the same
 * length. Returns `NaN` for empty input or if total weight is `0`. Throws
 * if `values.len() != weights.len()`.
 */
export function weightedAverage(values: Readonly<number[]>, weights: Readonly<number[]>): number {
  if (values.length !== weights.length) {
    throw new RangeError('weightedAverage: values and weights must have the same length');
  }
  if (values.length === 0) {
    return Number.NaN;
  }
  const valueScale = finiteAbsoluteScale(values);
  const weightScale = finiteAbsoluteScale(weights);
  if (!Number.isFinite(valueScale) || !Number.isFinite(weightScale)) {
    return unscaledWeightedAverage(values, weights);
  }
  if (weightScale === 0.0) {
    return Number.NaN;
  }
  const sumWeights = scaledSum(weights, weightScale);
  if (sumWeights === 0.0) {
    return Number.NaN;
  }
  if (valueScale === 0.0) {
    return 0.0;
  }
  let sumProduct = 0.0;
  let correction = 0.0;
  let i = 0;
  while (i < values.length) {
    const term = (values[i] / valueScale) * (weights[i] / weightScale) - correction;
    const next = sumProduct + term;
    correction = next - sumProduct - term;
    sumProduct = next;
    i += 1;
  }
  return (sumProduct / sumWeights) * valueScale;
}
