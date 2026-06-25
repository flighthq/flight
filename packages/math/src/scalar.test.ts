import { ceilPowerOfTwo, floorPowerOfTwo, quantize, sign } from './scalar';

describe('ceilPowerOfTwo', () => {
  it('rounds up to the next power of two', () => {
    expect(ceilPowerOfTwo(5)).toBe(8);
    expect(ceilPowerOfTwo(9)).toBe(16);
  });
  it('leaves an exact power of two unchanged', () => {
    expect(ceilPowerOfTwo(8)).toBe(8);
    expect(ceilPowerOfTwo(256)).toBe(256);
  });
});

describe('floorPowerOfTwo', () => {
  it('rounds down to the previous power of two', () => {
    expect(floorPowerOfTwo(6)).toBe(4);
    expect(floorPowerOfTwo(100)).toBe(64);
  });
  it('leaves an exact power of two unchanged', () => {
    expect(floorPowerOfTwo(8)).toBe(8);
  });
});

describe('quantize', () => {
  it('quantizes to the nearest step', () => {
    expect(quantize(0.7, 4, 0, 1)).toBeCloseTo(0.75, 10);
  });
  it('returns min at the lower bound', () => {
    expect(quantize(0, 4, 0, 1)).toBeCloseTo(0, 10);
  });
  it('returns max at the upper bound', () => {
    expect(quantize(1, 4, 0, 1)).toBeCloseTo(1, 10);
  });
  it('returns min when steps is 0', () => {
    expect(quantize(0.5, 0, 0, 1)).toBe(0);
  });
  it('returns min when min equals max', () => {
    expect(quantize(5, 4, 5, 5)).toBe(5);
  });
  it('clamps values outside the range', () => {
    expect(quantize(-1, 4, 0, 1)).toBeCloseTo(0, 10);
    expect(quantize(2, 4, 0, 1)).toBeCloseTo(1, 10);
  });
});

describe('sign', () => {
  it('returns 1 for positive values', () => {
    expect(sign(5)).toBe(1);
    expect(sign(0.001)).toBe(1);
  });
  it('returns -1 for negative values', () => {
    expect(sign(-5)).toBe(-1);
    expect(sign(-0.001)).toBe(-1);
  });
  it('returns 0 for zero', () => {
    expect(sign(0)).toBe(0);
  });
});
