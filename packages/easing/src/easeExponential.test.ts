import { easeInExponential, easeInOutExponential, easeOutExponential } from './easeExponential';

describe('easeInExponential', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInExponential(0)).toBe(0);
    expect(easeInExponential(1)).toBeCloseTo(1);
  });

  it('is slow at start (value below 0.5 at midpoint)', () => {
    expect(easeInExponential(0.5)).toBeLessThan(0.5);
  });
});

describe('easeInOutExponential', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutExponential(0)).toBe(0);
    expect(easeInOutExponential(1)).toBe(1);
  });

  it('is symmetric at midpoint', () => {
    expect(easeInOutExponential(0.5)).toBeCloseTo(0.5);
  });
});

describe('easeOutExponential', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutExponential(0)).toBeCloseTo(0);
    expect(easeOutExponential(1)).toBe(1);
  });

  it('is fast at start (value above 0.5 at midpoint)', () => {
    expect(easeOutExponential(0.5)).toBeGreaterThan(0.5);
  });
});
