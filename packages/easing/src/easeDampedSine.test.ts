import { easeInDampedSine, easeInOutDampedSine, easeOutDampedSine } from './easeDampedSine';
import { easeInElastic, easeInOutElastic, easeOutElastic } from './easeElastic';

describe('easeInDampedSine', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    const ease = easeInDampedSine(1, 0.4);

    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('winds up below 0 before departing', () => {
    expect(easeInDampedSine(1, 0.4)(0.8)).toBeLessThan(0);
  });

  it('matches the fixed easeInElastic at the constants that one hardcodes', () => {
    // The fixed curve is this one at amplitude 1, period 0.4 — the check that the general form is
    // right rather than merely plausible.
    const ease = easeInDampedSine(1, 0.4);
    for (const t of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      expect(ease(t)).toBeCloseTo(easeInElastic(t), 10);
    }
  });
});

describe('easeInOutDampedSine', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    const ease = easeInOutDampedSine(1, 0.45);

    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('matches the fixed easeInOutElastic at the constants that one hardcodes', () => {
    const ease = easeInOutDampedSine(1, 0.45);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(ease(t)).toBeCloseTo(easeInOutElastic(t), 10);
    }
  });
});

describe('easeOutDampedSine', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    const ease = easeOutDampedSine(1, 0.4);

    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('overshoots past 1 near the start', () => {
    expect(easeOutDampedSine(1, 0.4)(0.6)).toBeGreaterThan(1);
  });

  it('matches the fixed easeOutElastic at the constants that one hardcodes', () => {
    const ease = easeOutDampedSine(1, 0.4);
    for (const t of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      expect(ease(t)).toBeCloseTo(easeOutElastic(t), 10);
    }
  });

  it('separates the curves that the fixed form collapses together', () => {
    // The whole reason this family exists: a source stating its own period gets a materially
    // different curve, so substituting the fixed one is wrong rather than approximate. Measured as
    // the widest gap across the curve — any single sample can land where two curves happen to cross.
    const wide = easeOutDampedSine(1, 0.9);
    const narrow = easeOutDampedSine(1, 0.2);
    const widest = Math.max(
      ...Array.from({ length: 99 }, (_, index) => Math.abs(wide((index + 1) / 100) - narrow((index + 1) / 100))),
    );

    expect(widest).toBeGreaterThan(0.5);
  });

  it('overshoots further as amplitude grows', () => {
    const peak = (amplitude: number): number =>
      Math.max(...Array.from({ length: 99 }, (_, index) => easeOutDampedSine(amplitude, 0.4)((index + 1) / 100)));

    expect(peak(3)).toBeGreaterThan(peak(1));
  });

  it('raises an amplitude below 1 to the smallest defined curve', () => {
    // The phase term is asin(1 / amplitude), which has no real solution below unit amplitude, so the
    // curve is undefined there rather than merely small. Flight clamps rather than inventing a shape.
    const clamped = easeOutDampedSine(0.5, 0.4);
    const unit = easeOutDampedSine(1, 0.4);

    for (const t of [0.2, 0.5, 0.8]) expect(clamped(t)).toBeCloseTo(unit(t), 10);
    expect(Number.isFinite(clamped(0.3))).toBe(true);
  });

  it('falls back to this package own fixed period when the period is not positive', () => {
    // A period divides the wave, so zero has no meaning. Flight's choice is 0.4 — the constant
    // easeOutElastic already uses — so the parameterized and fixed families agree with each other.
    for (const period of [0, -1]) {
      const ease = easeOutDampedSine(1, period);
      expect(Number.isFinite(ease(0.5))).toBe(true);
      expect(ease(0.5)).toBeCloseTo(easeOutDampedSine(1, 0.4)(0.5), 10);
    }
  });
});
