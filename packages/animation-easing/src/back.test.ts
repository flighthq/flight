import { Back } from './back';

describe('Back', () => {
  it('easeIn returns 0 at t=0 and 1 at t=1', () => {
    expect(Back.easeIn(0)).toBeCloseTo(0);
    expect(Back.easeIn(1)).toBeCloseTo(1);
  });

  it('easeOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Back.easeOut(0)).toBeCloseTo(0);
    expect(Back.easeOut(1)).toBeCloseTo(1);
  });

  it('easeInOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Back.easeInOut(0)).toBeCloseTo(0);
    expect(Back.easeInOut(1)).toBeCloseTo(1);
  });

  it('easeOut overshoots past 1 before settling', () => {
    expect(Back.easeOut(0.7)).toBeGreaterThan(1);
  });

  it('easeIn undershoots below 0 before settling', () => {
    expect(Back.easeIn(0.3)).toBeLessThan(0);
  });
});
