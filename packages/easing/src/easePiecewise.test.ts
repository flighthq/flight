import { easeInCubic } from './easeCubic';
import { easeLinear } from './easeLinear';
import { easePiecewise } from './easePiecewise';

describe('easePiecewise', () => {
  it('throws on an empty segments array', () => {
    expect(() => easePiecewise([])).toThrow();
  });
  it('throws when total weight is zero', () => {
    expect(() => easePiecewise([{ ease: easeLinear, weight: 0 }])).toThrow();
  });
  it('single segment is equivalent to the wrapped function', () => {
    const fn = easePiecewise([{ ease: easeInCubic }]);
    expect(fn(0)).toBeCloseTo(easeInCubic(0));
    expect(fn(0.5)).toBeCloseTo(easeInCubic(0.5));
    expect(fn(1)).toBeCloseTo(easeInCubic(1));
  });
  it('two equal-weight segments split the range at t=0.5', () => {
    // First half uses easeLinear (identity), second half uses constant 0.
    const fn = easePiecewise([{ ease: easeLinear }, { ease: () => 0 }]);
    // At t=0.25 → in first segment, local t=0.5, easeLinear(0.5) = 0.5
    expect(fn(0.25)).toBeCloseTo(0.5);
    // At t=0.75 → in second segment, localT = 0.5, constant 0
    expect(fn(0.75)).toBeCloseTo(0);
  });
  it('respects weights: a segment with weight=2 gets twice the range', () => {
    // Segment 0: weight=1, range [0, 1/3]
    // Segment 1: weight=2, range [1/3, 1]
    const fn = easePiecewise([
      { ease: easeLinear, weight: 1 },
      { ease: () => 1, weight: 2 },
    ]);
    // t=1/6 is midpoint of segment 0 → easeLinear(0.5) = 0.5
    expect(fn(1 / 6)).toBeCloseTo(0.5);
    // t=2/3 is midpoint of segment 1 → constant 1
    expect(fn(2 / 3)).toBeCloseTo(1);
  });
  it('returns 0 at t=0 and uses the last segment at t=1', () => {
    const fn = easePiecewise([{ ease: easeLinear }, { ease: easeInCubic }]);
    expect(fn(0)).toBeCloseTo(0);
    expect(fn(1)).toBeCloseTo(1);
  });
  it('is boundary-safe for t=0 and t=1', () => {
    const fn = easePiecewise([{ ease: easeInCubic }, { ease: easeLinear }]);
    expect(fn(0)).toBeCloseTo(0);
    expect(fn(1)).toBeCloseTo(1);
  });
  it('default weight (undefined) is treated as 1', () => {
    const explicit = easePiecewise([
      { ease: easeLinear, weight: 1 },
      { ease: easeInCubic, weight: 1 },
    ]);
    const implicit = easePiecewise([{ ease: easeLinear }, { ease: easeInCubic }]);
    for (let i = 0; i <= 10; i++) {
      expect(implicit(i / 10)).toBeCloseTo(explicit(i / 10), 10);
    }
  });
});
