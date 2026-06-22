import { Bounce } from './bounce';

describe('Bounce', () => {
  it('easeIn returns 0 at t=0 and 1 at t=1', () => {
    expect(Bounce.easeIn(0)).toBeCloseTo(0);
    expect(Bounce.easeIn(1)).toBeCloseTo(1);
  });

  it('easeOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Bounce.easeOut(0)).toBeCloseTo(0);
    expect(Bounce.easeOut(1)).toBeCloseTo(1);
  });

  it('easeInOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Bounce.easeInOut(0)).toBeCloseTo(0);
    expect(Bounce.easeInOut(1)).toBeCloseTo(1);
  });

  it('easeIn is slow at start (value below 0.5 at midpoint)', () => {
    expect(Bounce.easeIn(0.5)).toBeLessThan(0.5);
  });

  it('easeOut is fast at start (value above 0.5 at midpoint)', () => {
    expect(Bounce.easeOut(0.5)).toBeGreaterThan(0.5);
  });
});
