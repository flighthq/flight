import { easeInOutCubic } from './easeCubic';
import { easeInOutPower, easeInPower, easeOutPower } from './easePower';
import { easeInQuadratic, easeOutQuadratic } from './easeQuadratic';
import { easeInQuintic } from './easeQuintic';

describe('easeInOutPower', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    const fn = easeInOutPower(3);
    expect(fn(0)).toBeCloseTo(0);
    expect(fn(1)).toBeCloseTo(1);
  });
  it('passes through 0.5 at t=0.5', () => {
    const fn = easeInOutPower(3);
    expect(fn(0.5)).toBeCloseTo(0.5);
  });
  it('matches easeInOutCubic at exponent=3', () => {
    const fn = easeInOutPower(3);
    expect(fn(0.3)).toBeCloseTo(easeInOutCubic(0.3), 10);
    expect(fn(0.7)).toBeCloseTo(easeInOutCubic(0.7), 10);
  });
  it('is symmetric: f(t) + f(1-t) = 1', () => {
    const fn = easeInOutPower(4);
    expect(fn(0.3) + fn(0.7)).toBeCloseTo(1);
    expect(fn(0.1) + fn(0.9)).toBeCloseTo(1);
  });
});

describe('easeInPower', () => {
  it('returns 0 at t=0 and 1 at t=1 for any exponent', () => {
    for (const exp of [0.5, 1, 2, 3, 5]) {
      const fn = easeInPower(exp);
      expect(fn(0)).toBeCloseTo(0);
      expect(fn(1)).toBeCloseTo(1);
    }
  });
  it('matches easeInQuadratic at exponent=2', () => {
    const fn = easeInPower(2);
    expect(fn(0.5)).toBeCloseTo(easeInQuadratic(0.5), 10);
    expect(fn(0.3)).toBeCloseTo(easeInQuadratic(0.3), 10);
  });
  it('matches easeInQuintic at exponent=5', () => {
    const fn = easeInPower(5);
    expect(fn(0.5)).toBeCloseTo(easeInQuintic(0.5), 10);
    expect(fn(0.7)).toBeCloseTo(easeInQuintic(0.7), 10);
  });
  it('sub-linear at exponent < 1', () => {
    const fn = easeInPower(0.5);
    // sqrt(0.25) = 0.5, so output should be 0.5 at t=0.25
    expect(fn(0.25)).toBeCloseTo(0.5, 10);
  });
  it('is monotonically increasing', () => {
    const fn = easeInPower(2.5);
    let prev = fn(0);
    for (let i = 1; i <= 20; i++) {
      const v = fn(i / 20);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('easeOutPower', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    const fn = easeOutPower(2);
    expect(fn(0)).toBeCloseTo(0);
    expect(fn(1)).toBeCloseTo(1);
  });
  it('matches easeOutQuadratic at exponent=2', () => {
    const fn = easeOutPower(2);
    expect(fn(0.5)).toBeCloseTo(easeOutQuadratic(0.5), 10);
    expect(fn(0.8)).toBeCloseTo(easeOutQuadratic(0.8), 10);
  });
  it('is monotonically increasing', () => {
    const fn = easeOutPower(3);
    let prev = fn(0);
    for (let i = 1; i <= 20; i++) {
      const v = fn(i / 20);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});
