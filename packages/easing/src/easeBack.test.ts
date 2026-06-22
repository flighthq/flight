import { easeInBack, easeInOutBack, easeOutBack } from './easeBack';

describe('easeInBack', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInBack(0)).toBeCloseTo(0);
    expect(easeInBack(1)).toBeCloseTo(1);
  });

  it('undershoots below 0 before settling', () => {
    expect(easeInBack(0.3)).toBeLessThan(0);
  });
});

describe('easeInOutBack', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutBack(0)).toBeCloseTo(0);
    expect(easeInOutBack(1)).toBeCloseTo(1);
  });
});

describe('easeOutBack', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
  });

  it('overshoots past 1 before settling', () => {
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
  });
});
