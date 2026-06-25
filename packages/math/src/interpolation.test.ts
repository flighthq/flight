import { inverseLerp, lerp, remap, smoothStep, step } from './interpolation';

describe('inverseLerp', () => {
  it('returns 0 when value equals a', () => {
    expect(inverseLerp(0, 10, 0)).toBe(0);
  });
  it('returns 1 when value equals b', () => {
    expect(inverseLerp(0, 10, 10)).toBe(1);
  });
  it('returns 0.5 for the midpoint', () => {
    expect(inverseLerp(0, 10, 5)).toBe(0.5);
  });
  it('returns 0 when a equals b to avoid division by zero', () => {
    expect(inverseLerp(5, 5, 5)).toBe(0);
  });
  it('works with negative ranges', () => {
    expect(inverseLerp(-10, 10, 0)).toBe(0.5);
  });
});

describe('lerp', () => {
  it('returns a when t is 0', () => {
    expect(lerp(0, 10, 0)).toBe(0);
  });
  it('returns b when t is 1', () => {
    expect(lerp(0, 10, 1)).toBe(10);
  });
  it('returns the midpoint for t = 0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
  it('extrapolates when t is outside [0, 1]', () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });
  it('works with negative values', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });
});

describe('remap', () => {
  it('maps a value from one range to another', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
  });
  it('maps the minimum input to the minimum output', () => {
    expect(remap(0, 0, 10, 50, 150)).toBe(50);
  });
  it('maps the maximum input to the maximum output', () => {
    expect(remap(10, 0, 10, 50, 150)).toBe(150);
  });
  it('returns outMin when inMin equals inMax', () => {
    expect(remap(5, 5, 5, 0, 100)).toBe(0);
  });
  it('works with inverted output ranges', () => {
    expect(remap(5, 0, 10, 100, 0)).toBe(50);
  });
});

describe('smoothStep', () => {
  it('returns 0 at the lower edge', () => {
    expect(smoothStep(0, 1, 0)).toBe(0);
  });
  it('returns 1 at the upper edge', () => {
    expect(smoothStep(0, 1, 1)).toBe(1);
  });
  it('returns 0.5 at the midpoint', () => {
    expect(smoothStep(0, 1, 0.5)).toBe(0.5);
  });
  it('returns 0 for x below the lower edge', () => {
    expect(smoothStep(0, 1, -1)).toBe(0);
  });
  it('returns 1 for x above the upper edge', () => {
    expect(smoothStep(0, 1, 2)).toBe(1);
  });
  it('has zero derivative at the edges', () => {
    const h = 0.001;
    const dLow = (smoothStep(0, 1, h) - smoothStep(0, 1, 0)) / h;
    const dHigh = (smoothStep(0, 1, 1) - smoothStep(0, 1, 1 - h)) / h;
    expect(dLow).toBeCloseTo(0, 1);
    expect(dHigh).toBeCloseTo(0, 1);
  });
});

describe('step', () => {
  it('returns 0 when x is less than edge', () => {
    expect(step(0.5, 0.3)).toBe(0);
  });
  it('returns 1 when x equals edge', () => {
    expect(step(0.5, 0.5)).toBe(1);
  });
  it('returns 1 when x is greater than edge', () => {
    expect(step(0.5, 0.7)).toBe(1);
  });
});
