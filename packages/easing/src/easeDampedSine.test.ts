// Generated from crates/flight-easing/tests/ease_damped_sine_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  easeInDampedSine,
  easeInElastic,
  easeInOutDampedSine,
  easeInOutElastic,
  easeOutDampedSine,
  easeOutElastic,
} from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInDampedSine', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    const ease = easeInDampedSine(1.0, 0.4);
    expect(ease(0.0)).toEqual(0.0);
    expect(ease(1.0)).toEqual(1.0);
  });
  it('winds up below 0 before departing', () => {
    expect(easeInDampedSine(1.0, 0.4)(0.8) < 0.0).toBe(true);
  });
  it('matches the fixed ease in elastic at the constants that one hardcodes', () => {
    const ease = easeInDampedSine(1.0, 0.4);
    for (const t of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      assertApprox(ease(t), easeInElastic(t));
    }
  });
});

describe('easeInOutDampedSine', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    const ease = easeInOutDampedSine(1.0, 0.45);
    expect(ease(0.0)).toEqual(0.0);
    expect(ease(1.0)).toEqual(1.0);
  });
  it('matches the fixed ease in out elastic at the constants that one hardcodes', () => {
    const ease = easeInOutDampedSine(1.0, 0.45);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      assertApprox(ease(t), easeInOutElastic(t));
    }
  });
});

describe('easeOutDampedSine', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    const ease = easeOutDampedSine(1.0, 0.4);
    expect(ease(0.0)).toEqual(0.0);
    expect(ease(1.0)).toEqual(1.0);
  });
  it('overshoots past 1 near the start', () => {
    expect(easeOutDampedSine(1.0, 0.4)(0.6) > 1.0).toBe(true);
  });
  it('matches the fixed ease out elastic at the constants that one hardcodes', () => {
    const ease = easeOutDampedSine(1.0, 0.4);
    for (const t of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      assertApprox(ease(t), easeOutElastic(t));
    }
  });
  it('separates the curves that the fixed form collapses together', () => {
    const wide = easeOutDampedSine(1.0, 0.9);
    const narrow = easeOutDampedSine(1.0, 0.2);
    let widest = 0.0;
    for (let i = 1; i < 100; i += 1) {
      const t = i / 100.0;
      const diff = Math.abs(wide(t) - narrow(t));
      if (diff > widest) {
        widest = diff;
      }
    }
    expect(widest > 0.5).toBe(true);
  });
  it('overshoots further as amplitude grows', () => {
    const peak = (amplitude: number): number => {
      const ease = easeOutDampedSine(amplitude, 0.4);
      let maxVal = 0.0;
      for (let i = 1; i < 100; i += 1) {
        const v = ease(i / 100.0);
        if (v > maxVal) {
          maxVal = v;
        }
      }
      return maxVal;
    };
    expect(peak(3.0) > peak(1.0)).toBe(true);
  });
  it('raises an amplitude below 1 to the smallest defined curve', () => {
    const clamped = easeOutDampedSine(0.5, 0.4);
    const unit = easeOutDampedSine(1.0, 0.4);
    for (const t of [0.2, 0.5, 0.8]) {
      assertApprox(clamped(t), unit(t));
    }
    expect(Number.isFinite(clamped(0.3))).toBe(true);
  });
  it('falls back to the fixed period when the period is not positive', () => {
    for (const period of [0.0, -1.0]) {
      const ease = easeOutDampedSine(1.0, period);
      expect(Number.isFinite(ease(0.5))).toBe(true);
      assertApprox(ease(0.5), easeOutDampedSine(1.0, 0.4)(0.5));
    }
  });
});
