import { easeInBounce, easeInOutBounce, easeOutBounce } from './easeBounce';

describe('easeInBounce', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInBounce(0)).toBeCloseTo(0);
    expect(easeInBounce(1)).toBeCloseTo(1);
  });

  it('is slow at start (value below 0.5 at midpoint)', () => {
    expect(easeInBounce(0.5)).toBeLessThan(0.5);
  });
});

describe('easeInOutBounce', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutBounce(0)).toBeCloseTo(0);
    expect(easeInOutBounce(1)).toBeCloseTo(1);
  });
});

describe('easeOutBounce', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutBounce(0)).toBeCloseTo(0);
    expect(easeOutBounce(1)).toBeCloseTo(1);
  });

  it('is fast at start (value above 0.5 at midpoint)', () => {
    expect(easeOutBounce(0.5)).toBeGreaterThan(0.5);
  });
});
