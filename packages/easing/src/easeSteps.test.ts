import { easeSteps } from './easeSteps';

describe('easeSteps', () => {
  it('jumpEnd holds at 0 first and reaches 1 only at t=1', () => {
    const ease = easeSteps(4, 'jumpEnd');
    expect(ease(0)).toBe(0);
    expect(ease(0.1)).toBe(0);
    expect(ease(0.25)).toBeCloseTo(0.25);
    expect(ease(0.6)).toBeCloseTo(0.5);
    expect(ease(0.99)).toBeCloseTo(0.75);
    expect(ease(1)).toBe(1);
  });

  it('jumpEnd is the default position', () => {
    const explicit = easeSteps(4, 'jumpEnd');
    const implicit = easeSteps(4);
    for (let i = 0; i <= 10; i++) {
      expect(implicit(i / 10)).toBe(explicit(i / 10));
    }
  });

  it('jumpStart jumps immediately and reaches 1 before t=1', () => {
    const ease = easeSteps(4, 'jumpStart');
    expect(ease(0)).toBeCloseTo(0.25);
    expect(ease(0.1)).toBeCloseTo(0.25);
    expect(ease(0.5)).toBeCloseTo(0.75);
    expect(ease(0.99)).toBe(1);
    expect(ease(1)).toBe(1);
  });

  it('jumpNone spans the closed range 0..1 with count-1 jumps', () => {
    const ease = easeSteps(4, 'jumpNone');
    expect(ease(0)).toBe(0);
    expect(ease(0.25)).toBeCloseTo(1 / 3);
    expect(ease(0.5)).toBeCloseTo(2 / 3);
    expect(ease(0.99)).toBe(1);
    expect(ease(1)).toBe(1);
  });

  it('jumpBoth never outputs 0 at the start, with interior 1/(n+1) steps', () => {
    const ease = easeSteps(4, 'jumpBoth');
    expect(ease(0)).toBeCloseTo(0.2);
    expect(ease(0.1)).toBeCloseTo(0.2);
    expect(ease(0.25)).toBeCloseTo(0.4);
    expect(ease(0.99)).toBeCloseTo(0.8);
    expect(ease(1)).toBe(1);
  });

  it('is monotonically non-decreasing for jumpEnd', () => {
    const ease = easeSteps(5, 'jumpEnd');
    let prev = ease(0);
    for (let i = 1; i <= 50; i++) {
      const value = ease(i / 50);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });
});
