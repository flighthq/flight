// Generated from crates/flight-math/tests/statistics_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { mean, median, standardDeviation, variance, weightedAverage } from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

function assertCloseF64(actual: number, expected: number, digits: number): void {
  const diff = Math.abs(actual - expected);
  const limit = 0.5 * Math.pow(10, -digits);
  expect(diff < limit, `expected ${expected}, got ${actual} (diff: ${diff}, limit: ${limit})`).toBe(true);
}

describe('mean', () => {
  it('returns the arithmetic mean', () => {
    expect(mean([1, 2, 3, 4, 5])).toEqual(3);
  });
  it('returns the single element for a one element array', () => {
    expect(mean([42])).toEqual(42);
  });
  it('returns nan for an empty array', () => {
    expect(Number.isNaN(mean([]))).toBe(true);
  });
  it('handles negative values', () => {
    expect(mean([-2, 0, 2])).toEqual(0);
  });
  it('does not overflow when the finite mean is representable', () => {
    expect(mean([Number.MAX_VALUE, Number.MAX_VALUE])).toEqual(Number.MAX_VALUE);
  });
  it('retains a small term across cancellation', () => {
    expect(mean([1, Number.EPSILON / 2, -1])).toEqual(Number.EPSILON / 6);
  });
  it('preserves zero and non finite propagation', () => {
    expect(mean([0, 0])).toEqual(0);
    expect(mean([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY])).toEqual(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(mean([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]))).toBe(true);
  });
});

describe('median', () => {
  it('returns the middle value for an odd length array', () => {
    expect(median([3, 1, 2])).toEqual(2);
  });
  it('returns the average of the two middle values for an even length array', () => {
    expect(median([1, 2, 3, 4])).toEqual(2.5);
  });
  it('returns nan for an empty array', () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });
  it('does not mutate the input', () => {
    const values = [5, 3, 1, 4, 2];
    const original = values;
    median(values);
    expect(values).toEqual(original);
  });
  it('does not overflow when averaging identical finite middle values', () => {
    expect(median([Number.MAX_VALUE, Number.MAX_VALUE])).toEqual(Number.MAX_VALUE);
  });
  it('does not prematurely underflow when averaging subnormal middle values', () => {
    expect(median([2.2250738585072014e-308 * 2, 2.2250738585072014e-308 * 3])).toEqual(2.2250738585072014e-308 * 2.5);
  });
  it('averages negative and non finite middle values without changing their semantics', () => {
    expect(median([-4, -2])).toEqual(-3);
    expect(median([-Number.MAX_VALUE, Number.MAX_VALUE])).toEqual(0);
    expect(median([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY])).toEqual(Number.POSITIVE_INFINITY);
  });
});

describe('standardDeviation', () => {
  it('returns 0 for a single element array', () => {
    expect(standardDeviation([5])).toEqual(0);
  });
  it('returns nan for an empty array', () => {
    expect(Number.isNaN(standardDeviation([]))).toBe(true);
  });
  it('computes the population standard deviation', () => {
    assertCloseF64(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]), 2, 5);
  });
  it('returns zero for identical maximum finite values', () => {
    expect(standardDeviation([Number.MAX_VALUE, Number.MAX_VALUE])).toEqual(0);
  });
  it('handles zero and preserves non finite propagation', () => {
    expect(standardDeviation([0, 0])).toEqual(0);
    expect(Number.isNaN(standardDeviation([Number.POSITIVE_INFINITY]))).toBe(true);
  });
});

describe('variance', () => {
  it('returns 0 for a single element array', () => {
    expect(variance([5])).toEqual(0);
  });
  it('returns nan for an empty array', () => {
    expect(Number.isNaN(variance([]))).toBe(true);
  });
  it('computes the population variance', () => {
    assertCloseF64(variance([2, 4, 4, 4, 5, 5, 7, 9]), 4, 5);
  });
  it('returns zero for identical maximum finite values', () => {
    expect(variance([Number.MAX_VALUE, Number.MAX_VALUE])).toEqual(0);
  });
  it('compensates the sum of squared deviations', () => {
    expect(variance([-1, 1_000_000_000_000, 1_000_000_000_000])).toEqual(2.2222222222266665e23);
  });
  it('handles zero and preserves non finite propagation', () => {
    expect(variance([0, 0])).toEqual(0);
    expect(Number.isNaN(variance([Number.POSITIVE_INFINITY]))).toBe(true);
  });
});

describe('weightedAverage', () => {
  it('returns the weighted average', () => {
    assertCloseF64(weightedAverage([1, 2, 3], [1, 1, 1]), 2, 10);
    assertCloseF64(weightedAverage([0, 10], [1, 3]), 7.5, 10);
  });
  it('returns nan for an empty array', () => {
    expect(Number.isNaN(weightedAverage([], []))).toBe(true);
  });
  it('returns nan when all weights are 0', () => {
    expect(Number.isNaN(weightedAverage([1, 2, 3], [0, 0, 0]))).toBe(true);
  });
  it('throws when arrays have different lengths', () => {
    crate.assertRangeError(() => {
      weightedAverage([1, 2], [1]);
    }, 'weightedAverage: values and weights must have the same length');
  });
  it('does not overflow when the finite weighted average is representable', () => {
    expect(weightedAverage([Number.MAX_VALUE, Number.MAX_VALUE], [1, 1])).toEqual(Number.MAX_VALUE);
  });
  it('uses normalized weights in the weighted product', () => {
    expect(weightedAverage([2, 10], [1, 3])).toEqual(8);
  });
  it('retains small weighted terms across cancellation', () => {
    expect(
      weightedAverage([10_000_000_000_000_000, -1_000_000_000_000_000, -10_000_000_000_000_000], [2, 1, 1]),
    ).toEqual(2_250_000_000_000_000);
  });
  it('handles zero values and cancelling non zero weights', () => {
    expect(weightedAverage([0, 0], [1, 1])).toEqual(0);
    expect(Number.isNaN(weightedAverage([1, 2], [1, -1]))).toBe(true);
  });
  it('preserves non finite weighted average propagation', () => {
    expect(weightedAverage([Number.POSITIVE_INFINITY], [1])).toEqual(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(weightedAverage([Number.POSITIVE_INFINITY, 1], [1, -1]))).toBe(true);
    expect(Number.isNaN(weightedAverage([1], [Number.POSITIVE_INFINITY]))).toBe(true);
  });
});
