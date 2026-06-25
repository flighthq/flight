import { ceilTo, euclideanMod, floorTo, fract, roundTo } from './rounding';

describe('ceilTo', () => {
  it('rounds up to the nearest step', () => {
    expect(ceilTo(7, 5)).toBe(10);
  });
  it('leaves an exact multiple unchanged', () => {
    expect(ceilTo(10, 5)).toBe(10);
  });
  it('returns value when step is 0', () => {
    expect(ceilTo(7, 0)).toBe(7);
  });
  it('works with negative values', () => {
    expect(ceilTo(-7, 5)).toBe(-5);
  });
});

describe('euclideanMod', () => {
  it('returns the remainder for positive inputs', () => {
    expect(euclideanMod(7, 4)).toBe(3);
  });
  it('returns a non-negative result for negative inputs', () => {
    expect(euclideanMod(-1, 4)).toBe(3);
    expect(euclideanMod(-5, 4)).toBe(3);
  });
  it('returns 0 when value is a multiple of divisor', () => {
    expect(euclideanMod(8, 4)).toBe(0);
  });
  it('throws for a zero divisor', () => {
    expect(() => euclideanMod(7, 0)).toThrow(RangeError);
  });
});

describe('floorTo', () => {
  it('rounds down to the nearest step', () => {
    expect(floorTo(7, 5)).toBe(5);
  });
  it('leaves an exact multiple unchanged', () => {
    expect(floorTo(10, 5)).toBe(10);
  });
  it('returns value when step is 0', () => {
    expect(floorTo(7, 0)).toBe(7);
  });
  it('works with negative values', () => {
    expect(floorTo(-7, 5)).toBe(-10);
  });
});

describe('fract', () => {
  it('returns the fractional part of a positive number', () => {
    expect(fract(3.75)).toBeCloseTo(0.75, 10);
  });
  it('returns 0 for an integer', () => {
    expect(fract(3)).toBe(0);
  });
  it('preserves sign for negative numbers', () => {
    expect(fract(-1.3)).toBeCloseTo(-0.3, 10);
  });
  it('returns 0 for 0', () => {
    expect(fract(0)).toBe(0);
  });
});

describe('roundTo', () => {
  it('rounds to the nearest step', () => {
    expect(roundTo(7, 5)).toBe(5);
    expect(roundTo(8, 5)).toBe(10);
  });
  it('leaves an exact multiple unchanged', () => {
    expect(roundTo(10, 5)).toBe(10);
  });
  it('returns value when step is 0', () => {
    expect(roundTo(7, 0)).toBe(7);
  });
  it('works with floating-point steps', () => {
    expect(roundTo(0.3, 0.1)).toBeCloseTo(0.3, 10);
  });
  it('works with negative values', () => {
    expect(roundTo(-7, 5)).toBe(-5);
  });
});
