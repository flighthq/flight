import { easeInOutSine, easeInSine, easeOutSine } from './easeSine';

describe('easeInOutSine', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutSine(0)).toBeCloseTo(0);
    expect(easeInOutSine(1)).toBeCloseTo(1);
  });

  it('is symmetric at midpoint', () => {
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
  });
});

describe('easeInSine', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInSine(0)).toBeCloseTo(0);
    expect(easeInSine(1)).toBeCloseTo(1);
  });

  it('is slow at start (value below 0.5 at midpoint)', () => {
    expect(easeInSine(0.5)).toBeLessThan(0.5);
  });
});

describe('easeOutSine', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutSine(0)).toBeCloseTo(0);
    expect(easeOutSine(1)).toBeCloseTo(1);
  });

  it('is fast at start (value above 0.5 at midpoint)', () => {
    expect(easeOutSine(0.5)).toBeGreaterThan(0.5);
  });
});
