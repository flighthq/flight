import { Expo } from './expo';

describe('Expo', () => {
  it('easeIn returns 0 at t=0 and 1 at t=1', () => {
    expect(Expo.easeIn(0)).toBe(0);
    expect(Expo.easeIn(1)).toBeCloseTo(1);
  });

  it('easeOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Expo.easeOut(0)).toBeCloseTo(0);
    expect(Expo.easeOut(1)).toBe(1);
  });

  it('easeInOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Expo.easeInOut(0)).toBe(0);
    expect(Expo.easeInOut(1)).toBe(1);
  });

  it('easeIn is slow at start (value below 0.5 at midpoint)', () => {
    expect(Expo.easeIn(0.5)).toBeLessThan(0.5);
  });

  it('easeOut is fast at start (value above 0.5 at midpoint)', () => {
    expect(Expo.easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('easeInOut is symmetric at midpoint', () => {
    expect(Expo.easeInOut(0.5)).toBeCloseTo(0.5);
  });
});
