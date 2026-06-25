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
});
