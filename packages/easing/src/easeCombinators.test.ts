import { easeClamp, easeClampOutput, easeInvert, easeMirror, easeReverse, easeScaleOutput } from './easeCombinators';
import { easeInCubic, easeOutCubic } from './easeCubic';

describe('easeClamp', () => {
  it('passes through values already in [0,1]', () => {
    const clamped = easeClamp(easeInCubic);
    expect(clamped(0)).toBeCloseTo(easeInCubic(0));
    expect(clamped(0.5)).toBeCloseTo(easeInCubic(0.5));
    expect(clamped(1)).toBeCloseTo(easeInCubic(1));
  });
  it('clamps negative t to 0', () => {
    const clamped = easeClamp(easeInCubic);
    expect(clamped(-0.5)).toBeCloseTo(easeInCubic(0));
  });
  it('clamps t above 1 to 1', () => {
    const clamped = easeClamp(easeInCubic);
    expect(clamped(1.5)).toBeCloseTo(easeInCubic(1));
  });
  it('is safe when composed: easeClamp(easeClamp(fn))', () => {
    const double = easeClamp(easeClamp(easeInCubic));
    expect(double(-1)).toBeCloseTo(easeInCubic(0));
    expect(double(2)).toBeCloseTo(easeInCubic(1));
  });
});

describe('easeClampOutput', () => {
  it('does not clamp when output is within range', () => {
    const fn = easeClampOutput(easeInCubic, 0, 1);
    expect(fn(0.5)).toBeCloseTo(easeInCubic(0.5));
  });
  it('clamps output below min', () => {
    // a constant function returning -0.5 for the test
    const below = easeClampOutput(() => -0.5, 0, 1);
    expect(below(0.5)).toBe(0);
  });
  it('clamps output above max', () => {
    const above = easeClampOutput(() => 1.5, 0, 1);
    expect(above(0.5)).toBe(1);
  });
  it('respects custom range', () => {
    const fn = easeClampOutput(easeInCubic, 0.2, 0.8);
    expect(fn(0)).toBe(0.2);
    expect(fn(1)).toBe(0.8);
  });
});

describe('easeInvert', () => {
  it('maps 0 to 1 and 1 to 0', () => {
    const inv = easeInvert(easeInCubic);
    expect(inv(0)).toBeCloseTo(1);
    expect(inv(1)).toBeCloseTo(0);
  });
  it('is the vertical mirror: easeInvert(f)(t) = 1 - f(t)', () => {
    const inv = easeInvert(easeInCubic);
    expect(inv(0.5)).toBeCloseTo(1 - easeInCubic(0.5));
    expect(inv(0.3)).toBeCloseTo(1 - easeInCubic(0.3));
  });
  it('double inversion is the identity', () => {
    const id = easeInvert(easeInvert(easeInCubic));
    expect(id(0.4)).toBeCloseTo(easeInCubic(0.4));
  });
});

describe('easeMirror', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    const fn = easeMirror(easeInCubic);
    expect(fn(0)).toBeCloseTo(0);
    expect(fn(1)).toBeCloseTo(1);
  });
  it('passes through 0.5 at t=0.5', () => {
    const fn = easeMirror(easeInCubic);
    expect(fn(0.5)).toBeCloseTo(0.5);
  });
  it('is symmetric: f(t) + f(1-t) = 1', () => {
    const fn = easeMirror(easeInCubic);
    expect(fn(0.3) + fn(0.7)).toBeCloseTo(1);
    expect(fn(0.1) + fn(0.9)).toBeCloseTo(1);
  });
});

describe('easeReverse', () => {
  it('converts an In curve to an Out curve: f(t) = 1 - easeIn(1 - t)', () => {
    const reversed = easeReverse(easeInCubic);
    expect(reversed(0.3)).toBeCloseTo(1 - easeInCubic(0.7));
    expect(reversed(0.7)).toBeCloseTo(1 - easeInCubic(0.3));
  });
  it('returns 0 at t=0 and 1 at t=1', () => {
    const reversed = easeReverse(easeInCubic);
    expect(reversed(0)).toBeCloseTo(0);
    expect(reversed(1)).toBeCloseTo(1);
  });
  it('easeReverse(easeInCubic) approximates easeOutCubic', () => {
    const reversed = easeReverse(easeInCubic);
    expect(reversed(0.5)).toBeCloseTo(easeOutCubic(0.5), 10);
    expect(reversed(0.3)).toBeCloseTo(easeOutCubic(0.3), 10);
  });
  it('double reverse is the identity', () => {
    const id = easeReverse(easeReverse(easeInCubic));
    expect(id(0.4)).toBeCloseTo(easeInCubic(0.4));
  });
});

describe('easeScaleOutput', () => {
  it('maps [0,1] output to [fromValue, toValue]', () => {
    const fn = easeScaleOutput(easeInCubic, 100, 300);
    expect(fn(0)).toBeCloseTo(100);
    expect(fn(1)).toBeCloseTo(300);
    expect(fn(0.5)).toBeCloseTo(100 + easeInCubic(0.5) * 200);
  });
  it('handles inverted ranges (toValue < fromValue)', () => {
    const fn = easeScaleOutput(easeInCubic, 300, 100);
    expect(fn(0)).toBeCloseTo(300);
    expect(fn(1)).toBeCloseTo(100);
  });
  it('is alias-safe: same result when composed', () => {
    const fn = easeScaleOutput(easeInCubic, 0, 1);
    expect(fn(0.5)).toBeCloseTo(easeInCubic(0.5));
  });
});
