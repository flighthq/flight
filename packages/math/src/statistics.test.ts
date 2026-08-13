import { mean, median, standardDeviation, variance, weightedAverage } from './statistics';

describe('mean', () => {
  it('returns the arithmetic mean', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
  it('returns the single element for a one-element array', () => {
    expect(mean([42])).toBe(42);
  });
  it('returns NaN for an empty array', () => {
    expect(mean([])).toBeNaN();
  });
  it('handles negative values', () => {
    expect(mean([-2, 0, 2])).toBe(0);
  });
  it('does not overflow when the finite mean is representable', () => {
    expect(mean([Number.MAX_VALUE, Number.MAX_VALUE])).toBe(Number.MAX_VALUE);
  });
  it('retains a small term across cancellation', () => {
    expect(mean([1, Number.EPSILON / 2, -1])).toBe(Number.EPSILON / 6);
  });
  it('preserves zero and non-finite propagation', () => {
    expect(mean([0, 0])).toBe(0);
    expect(mean([Infinity, Infinity])).toBe(Infinity);
    expect(mean([Infinity, -Infinity])).toBeNaN();
  });
});

describe('median', () => {
  it('returns the middle value for an odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('returns the average of the two middle values for an even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('returns NaN for an empty array', () => {
    expect(median([])).toBeNaN();
  });
  it('does not mutate the input', () => {
    const values = [5, 3, 1, 4, 2];
    const original = values.slice();
    median(values);
    expect(values).toEqual(original);
  });
  it('does not overflow when averaging identical finite middle values', () => {
    expect(median([Number.MAX_VALUE, Number.MAX_VALUE])).toBe(Number.MAX_VALUE);
  });
  it('does not prematurely underflow when averaging subnormal middle values', () => {
    expect(median([Number.MIN_VALUE * 2, Number.MIN_VALUE * 3])).toBe(Number.MIN_VALUE * 2);
  });
  it('averages negative and non-finite middle values without changing their semantics', () => {
    expect(median([-4, -2])).toBe(-3);
    expect(median([-Number.MAX_VALUE, Number.MAX_VALUE])).toBe(0);
    expect(median([Infinity, Infinity])).toBe(Infinity);
  });
});

describe('standardDeviation', () => {
  it('returns 0 for a single-element array', () => {
    expect(standardDeviation([5])).toBe(0);
  });
  it('returns NaN for an empty array', () => {
    expect(standardDeviation([])).toBeNaN();
  });
  it('computes the population standard deviation', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });
  it('returns zero for identical maximum finite values', () => {
    expect(standardDeviation([Number.MAX_VALUE, Number.MAX_VALUE])).toBe(0);
  });
  it('handles zero and preserves non-finite propagation', () => {
    expect(standardDeviation([0, 0])).toBe(0);
    expect(standardDeviation([Infinity])).toBeNaN();
  });
});

describe('variance', () => {
  it('returns 0 for a single-element array', () => {
    expect(variance([5])).toBe(0);
  });
  it('returns NaN for an empty array', () => {
    expect(variance([])).toBeNaN();
  });
  it('computes the population variance', () => {
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4, 5);
  });
  it('returns zero for identical maximum finite values', () => {
    expect(variance([Number.MAX_VALUE, Number.MAX_VALUE])).toBe(0);
  });
  it('compensates the sum of squared deviations', () => {
    expect(variance([-1, 1_000_000_000_000, 1_000_000_000_000])).toBe(2.2222222222266665e23);
  });
  it('handles zero and preserves non-finite propagation', () => {
    expect(variance([0, 0])).toBe(0);
    expect(variance([Infinity])).toBeNaN();
  });
});

describe('weightedAverage', () => {
  it('returns the weighted average', () => {
    expect(weightedAverage([1, 2, 3], [1, 1, 1])).toBeCloseTo(2, 10);
    expect(weightedAverage([0, 10], [1, 3])).toBeCloseTo(7.5, 10);
  });
  it('returns NaN for an empty array', () => {
    expect(weightedAverage([], [])).toBeNaN();
  });
  it('returns NaN when all weights are 0', () => {
    expect(weightedAverage([1, 2, 3], [0, 0, 0])).toBeNaN();
  });
  it('throws when arrays have different lengths', () => {
    expect(() => weightedAverage([1, 2], [1])).toThrow(RangeError);
  });
  it('does not overflow when the finite weighted average is representable', () => {
    expect(weightedAverage([Number.MAX_VALUE, Number.MAX_VALUE], [1, 1])).toBe(Number.MAX_VALUE);
  });
  it('uses normalized weights in the weighted product', () => {
    expect(weightedAverage([2, 10], [1, 3])).toBe(8);
  });
  it('retains small weighted terms across cancellation', () => {
    expect(weightedAverage([10_000_000_000_000_000, -1_000_000_000_000_000, -10_000_000_000_000_000], [2, 1, 1])).toBe(
      2_250_000_000_000_000,
    );
  });
  it('handles zero values and cancelling non-zero weights', () => {
    expect(weightedAverage([0, 0], [1, 1])).toBe(0);
    expect(weightedAverage([1, 2], [1, -1])).toBeNaN();
  });
  it('preserves non-finite weighted-average propagation', () => {
    expect(weightedAverage([Infinity], [1])).toBe(Infinity);
    expect(weightedAverage([Infinity, 1], [1, -1])).toBeNaN();
    expect(weightedAverage([1], [Infinity])).toBeNaN();
  });
});
