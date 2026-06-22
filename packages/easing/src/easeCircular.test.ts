import { easeInCircular, easeInOutCircular, easeOutCircular } from './easeCircular';

describe('easeInCircular', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInCircular(0)).toBeCloseTo(0);
    expect(easeInCircular(1)).toBeCloseTo(1);
  });

  it('is slow at start (value below 0.5 at midpoint)', () => {
    expect(easeInCircular(0.5)).toBeLessThan(0.5);
    expect(easeInCircular(0.5)).toBeCloseTo(1 - Math.sqrt(0.75));
  });

  it('is monotonically increasing', () => {
    let prev = easeInCircular(0);
    for (let i = 1; i <= 20; i++) {
      const value = easeInCircular(i / 20);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });
});

describe('easeInOutCircular', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutCircular(0)).toBeCloseTo(0);
    expect(easeInOutCircular(1)).toBeCloseTo(1);
  });

  it('is symmetric at midpoint', () => {
    expect(easeInOutCircular(0.5)).toBeCloseTo(0.5);
  });
});

describe('easeOutCircular', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutCircular(0)).toBeCloseTo(0);
    expect(easeOutCircular(1)).toBeCloseTo(1);
  });

  it('is fast at start (value above 0.5 at midpoint)', () => {
    expect(easeOutCircular(0.5)).toBeGreaterThan(0.5);
  });
});
