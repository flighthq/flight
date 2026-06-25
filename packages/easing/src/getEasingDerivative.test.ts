import { easeInCubic, easeOutCubic } from './easeCubic';
import { easeLinear } from './easeLinear';
import { getEasingDerivative } from './getEasingDerivative';

describe('getEasingDerivative', () => {
  it('returns ~1 everywhere for easeLinear (slope is constant 1)', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(getEasingDerivative(easeLinear, t)).toBeCloseTo(1, 4);
    }
  });
  it('returns 0 at t=0 for easeInCubic (zero slope at start)', () => {
    // easeInCubic = t^3, derivative = 3t^2 → 0 at t=0
    expect(getEasingDerivative(easeInCubic, 0)).toBeCloseTo(0, 3);
  });
  it('returns 3 at t=1 for easeInCubic (derivative = 3t² = 3 at t=1)', () => {
    expect(getEasingDerivative(easeInCubic, 1)).toBeCloseTo(3, 3);
  });
  it('returns 3 at t=0 for easeOutCubic (derivative = 3(1-t)² = 3 at t=0)', () => {
    expect(getEasingDerivative(easeOutCubic, 0)).toBeCloseTo(3, 3);
  });
  it('returns 0 at t=1 for easeOutCubic (zero slope at end)', () => {
    expect(getEasingDerivative(easeOutCubic, 1)).toBeCloseTo(0, 3);
  });
  it('uses centered difference at interior points', () => {
    // At t=0.5, easeInCubic derivative = 3*(0.5)^2 = 0.75
    expect(getEasingDerivative(easeInCubic, 0.5)).toBeCloseTo(0.75, 3);
  });
  it('accepts a custom epsilon', () => {
    expect(getEasingDerivative(easeLinear, 0.5, 1e-4)).toBeCloseTo(1, 3);
  });
  it('handles the left boundary without throwing', () => {
    expect(() => getEasingDerivative(easeInCubic, 0)).not.toThrow();
  });
  it('handles the right boundary without throwing', () => {
    expect(() => getEasingDerivative(easeInCubic, 1)).not.toThrow();
  });
});
