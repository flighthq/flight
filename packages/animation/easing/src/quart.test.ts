import { Quart } from './quart';

describe('Quart', () => {
  it('easeIn returns 0 at t=0 and 1 at t=1', () => {
    expect(Quart.easeIn(0)).toBe(0);
    expect(Quart.easeIn(1)).toBe(1);
  });

  it('easeOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Quart.easeOut(0)).toBe(0);
    expect(Quart.easeOut(1)).toBe(1);
  });

  it('easeInOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Quart.easeInOut(0)).toBe(0);
    expect(Quart.easeInOut(1)).toBe(1);
  });

  it('easeIn is slow at start (value below 0.5 at midpoint)', () => {
    expect(Quart.easeIn(0.5)).toBeLessThan(0.5);
  });

  it('easeOut is fast at start (value above 0.5 at midpoint)', () => {
    expect(Quart.easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('easeInOut is symmetric at midpoint', () => {
    expect(Quart.easeInOut(0.5)).toBeCloseTo(0.5);
  });
});
