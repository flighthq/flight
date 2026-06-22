import { easeInCubic, easeInOutCubic, easeOutCubic } from './easeCubic';

describe('easeInCubic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInCubic(0)).toBe(0);
    expect(easeInCubic(1)).toBe(1);
  });

  it('is slow at start (value below 0.5 at midpoint)', () => {
    expect(easeInCubic(0.5)).toBeLessThan(0.5);
  });
});

describe('easeInOutCubic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('is symmetric at midpoint', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
});

describe('easeOutCubic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('is fast at start (value above 0.5 at midpoint)', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
