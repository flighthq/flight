import { Sine } from './sine';

describe('Sine', () => {
  it('easeIn returns 0 at t=0 and 1 at t=1', () => {
    expect(Sine.easeIn(0)).toBeCloseTo(0);
    expect(Sine.easeIn(1)).toBeCloseTo(1);
  });

  it('easeOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Sine.easeOut(0)).toBeCloseTo(0);
    expect(Sine.easeOut(1)).toBeCloseTo(1);
  });

  it('easeInOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Sine.easeInOut(0)).toBeCloseTo(0);
    expect(Sine.easeInOut(1)).toBeCloseTo(1);
  });

  it('easeIn is slow at start (value below 0.5 at midpoint)', () => {
    expect(Sine.easeIn(0.5)).toBeLessThan(0.5);
  });

  it('easeOut is fast at start (value above 0.5 at midpoint)', () => {
    expect(Sine.easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('easeInOut is symmetric at midpoint', () => {
    expect(Sine.easeInOut(0.5)).toBeCloseTo(0.5);
  });
});
