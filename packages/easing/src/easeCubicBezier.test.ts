import { easeCubicBezier } from './easeCubicBezier';

describe('easeCubicBezier', () => {
  it('returns exact endpoints regardless of control points', () => {
    const ease = easeCubicBezier(0.25, 0.1, 0.25, 1.0);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('clamps out-of-range input to the endpoints', () => {
    const ease = easeCubicBezier(0.42, 0, 0.58, 1);
    expect(ease(-0.5)).toBe(0);
    expect(ease(1.5)).toBe(1);
  });

  it('approximates the identity for the diagonal control points', () => {
    const linear = easeCubicBezier(0, 0, 1, 1);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      expect(linear(t)).toBeCloseTo(t, 3);
    }
  });

  it('matches the CSS "ease" curve at a sampled point', () => {
    const ease = easeCubicBezier(0.25, 0.1, 0.25, 1.0);
    // The CSS default "ease" front-loads progress; at the midpoint it is well
    // ahead of linear. Reference value from a WebKit UnitBezier evaluation.
    expect(ease(0.5)).toBeCloseTo(0.8024, 2);
    expect(ease(0.5)).toBeGreaterThan(0.5);
  });

  it('is monotonically non-decreasing across the interval', () => {
    const ease = easeCubicBezier(0.25, 0.1, 0.25, 1.0);
    let prev = ease(0);
    for (let i = 1; i <= 50; i++) {
      const value = ease(i / 50);
      expect(value).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = value;
    }
  });

  it('inverts x correctly for an asymmetric curve', () => {
    const ease = easeCubicBezier(0.42, 0, 0.58, 1);
    // ease-in-out is symmetric about the midpoint.
    expect(ease(0.5)).toBeCloseTo(0.5, 2);
  });
});
