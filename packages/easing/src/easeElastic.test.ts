import { easeInElastic, easeInOutElastic, easeOutElastic } from './easeElastic';

describe('easeInElastic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInElastic(0)).toBe(0);
    expect(easeInElastic(1)).toBe(1);
  });

  it('oscillates below 0 before reaching target', () => {
    expect(easeInElastic(0.8)).toBeLessThan(0);
  });
});

describe('easeInOutElastic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutElastic(0)).toBe(0);
    expect(easeInOutElastic(1)).toBe(1);
  });
});

describe('easeOutElastic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutElastic(0)).toBe(0);
    expect(easeOutElastic(1)).toBe(1);
  });

  it('oscillates past 1 near the end', () => {
    expect(easeOutElastic(0.6)).toBeGreaterThan(1);
  });
});
