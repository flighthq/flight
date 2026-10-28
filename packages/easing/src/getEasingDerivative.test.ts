// Generated from crates/flight-easing/tests/get_easing_derivative_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EASING_DERIVATIVE_EPSILON,
  easeInCubic,
  easeLinear,
  easeOutCubic,
  getEasingDerivative,
} from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 0.01, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('getEasingDerivative', () => {
  it('returns approximately 1 everywhere for ease linear', () => {
    for (const t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      assertApprox(getEasingDerivative(easeLinear, t, DEFAULT_EASING_DERIVATIVE_EPSILON), 1.0);
    }
  });
  it('returns 0 at t 0 for ease in cubic', () => {
    assertApprox(getEasingDerivative(easeInCubic, 0.0, DEFAULT_EASING_DERIVATIVE_EPSILON), 0.0);
  });
  it('returns 3 at t 1 for ease in cubic', () => {
    assertApprox(getEasingDerivative(easeInCubic, 1.0, DEFAULT_EASING_DERIVATIVE_EPSILON), 3.0);
  });
  it('returns 3 at t 0 for ease out cubic', () => {
    assertApprox(getEasingDerivative(easeOutCubic, 0.0, DEFAULT_EASING_DERIVATIVE_EPSILON), 3.0);
  });
  it('returns 0 at t 1 for ease out cubic', () => {
    assertApprox(getEasingDerivative(easeOutCubic, 1.0, DEFAULT_EASING_DERIVATIVE_EPSILON), 0.0);
  });
  it('uses centered difference at interior points', () => {
    assertApprox(getEasingDerivative(easeInCubic, 0.5, DEFAULT_EASING_DERIVATIVE_EPSILON), 0.75);
  });
  it('accepts a custom epsilon', () => {
    assertApprox(getEasingDerivative(easeLinear, 0.5, 1e-4), 1.0);
  });
  it('uses the default epsilon when none is given', () => {
    assertApprox(getEasingDerivative(easeLinear, 0.5, undefined), 1.0);
    assertApprox(
      getEasingDerivative(easeInCubic, 0.5, undefined),
      getEasingDerivative(easeInCubic, 0.5, DEFAULT_EASING_DERIVATIVE_EPSILON),
    );
  });
  it('handles the left boundary without panicking', () => {
    getEasingDerivative(easeInCubic, 0.0, DEFAULT_EASING_DERIVATIVE_EPSILON);
  });
  it('handles the right boundary without panicking', () => {
    getEasingDerivative(easeInCubic, 1.0, DEFAULT_EASING_DERIVATIVE_EPSILON);
  });
});
