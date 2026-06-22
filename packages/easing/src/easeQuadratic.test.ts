import { easeInOutQuadratic, easeInQuadratic, easeOutQuadratic } from './easeQuadratic';

describe('easeInOutQuadratic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutQuadratic(0)).toBe(0);
    expect(easeInOutQuadratic(1)).toBe(1);
  });

  it('is symmetric at midpoint', () => {
    expect(easeInOutQuadratic(0.5)).toBeCloseTo(0.5);
  });
});

describe('easeInQuadratic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInQuadratic(0)).toBe(0);
    expect(easeInQuadratic(1)).toBe(1);
  });

  it('is slow at start (value below 0.5 at midpoint)', () => {
    expect(easeInQuadratic(0.5)).toBeLessThan(0.5);
  });
});

describe('easeOutQuadratic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutQuadratic(0)).toBe(0);
    expect(easeOutQuadratic(1)).toBe(1);
  });

  it('is fast at start (value above 0.5 at midpoint)', () => {
    expect(easeOutQuadratic(0.5)).toBeGreaterThan(0.5);
  });
});
