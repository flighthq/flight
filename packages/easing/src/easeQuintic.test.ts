import { easeInOutQuintic, easeInQuintic, easeOutQuintic } from './easeQuintic';

describe('easeInOutQuintic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutQuintic(0)).toBe(0);
    expect(easeInOutQuintic(1)).toBe(1);
  });

  it('is symmetric at midpoint', () => {
    expect(easeInOutQuintic(0.5)).toBeCloseTo(0.5);
  });
});

describe('easeInQuintic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInQuintic(0)).toBe(0);
    expect(easeInQuintic(1)).toBe(1);
  });

  it('is slow at start (value below 0.5 at midpoint)', () => {
    expect(easeInQuintic(0.5)).toBeLessThan(0.5);
  });
});

describe('easeOutQuintic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutQuintic(0)).toBe(0);
    expect(easeOutQuintic(1)).toBe(1);
  });

  it('is fast at start (value above 0.5 at midpoint)', () => {
    expect(easeOutQuintic(0.5)).toBeGreaterThan(0.5);
  });
});
