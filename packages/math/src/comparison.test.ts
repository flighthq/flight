import { approxEqual, approxEqualRelative, approxZero } from './comparison';

describe('approxEqual', () => {
  it('returns true for identical values', () => {
    expect(approxEqual(1, 1)).toBe(true);
  });
  it('returns true when values are within the default epsilon', () => {
    expect(approxEqual(1, 1 + 1e-7)).toBe(true);
  });
  it('returns false when values differ by more than the default epsilon', () => {
    expect(approxEqual(1, 1 + 1e-5)).toBe(false);
  });
  it('accepts a custom epsilon', () => {
    expect(approxEqual(1, 1.1, 0.2)).toBe(true);
    expect(approxEqual(1, 1.3, 0.2)).toBe(false);
  });
  it('returns true for zero and near-zero', () => {
    expect(approxEqual(0, 1e-7)).toBe(true);
  });
  it('works with negative values', () => {
    expect(approxEqual(-1, -1 - 1e-7)).toBe(true);
  });
});

describe('approxEqualRelative', () => {
  it('returns true for identical values', () => {
    expect(approxEqualRelative(1000, 1000)).toBe(true);
  });
  it('returns true for large values within relative epsilon', () => {
    expect(approxEqualRelative(1e8, 1e8 + 1)).toBe(true);
  });
  it('returns false when large values differ beyond relative epsilon', () => {
    expect(approxEqualRelative(1e8, 1e8 * 2)).toBe(false);
  });
  it('returns true for near-zero values within absolute epsilon', () => {
    expect(approxEqualRelative(0, 1e-7)).toBe(true);
  });
});

describe('approxZero', () => {
  it('returns true for exact zero', () => {
    expect(approxZero(0)).toBe(true);
  });
  it('returns true for values within epsilon', () => {
    expect(approxZero(1e-7)).toBe(true);
  });
  it('returns false for values outside epsilon', () => {
    expect(approxZero(1e-4)).toBe(false);
  });
  it('accepts a custom epsilon', () => {
    expect(approxZero(0.01, 0.1)).toBe(true);
    expect(approxZero(0.2, 0.1)).toBe(false);
  });
});
