import { easeInOutQuartic, easeInQuartic, easeOutQuartic } from './easeQuartic';

describe('easeInOutQuartic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutQuartic(0)).toBe(0);
    expect(easeInOutQuartic(1)).toBe(1);
  });

  it('is symmetric at midpoint', () => {
    expect(easeInOutQuartic(0.5)).toBeCloseTo(0.5);
  });
});

describe('easeInQuartic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInQuartic(0)).toBe(0);
    expect(easeInQuartic(1)).toBe(1);
  });

  it('is slow at start (value below 0.5 at midpoint)', () => {
    expect(easeInQuartic(0.5)).toBeLessThan(0.5);
  });
});

describe('easeOutQuartic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutQuartic(0)).toBe(0);
    expect(easeOutQuartic(1)).toBe(1);
  });

  it('is fast at start (value above 0.5 at midpoint)', () => {
    expect(easeOutQuartic(0.5)).toBeGreaterThan(0.5);
  });
});
