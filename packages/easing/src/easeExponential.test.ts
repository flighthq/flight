// Generated from crates/flight-easing/tests/ease_exponential_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInExponential, easeInOutExponential, easeOutExponential } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInExponential', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInExponential(0.0)).toEqual(0.0);
    assertApprox(easeInExponential(1.0), 1.0);
  });
  it('is slow at start', () => {
    expect(easeInExponential(0.5) < 0.5).toBe(true);
  });
});

describe('easeInOutExponential', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInOutExponential(0.0)).toEqual(0.0);
    expect(easeInOutExponential(1.0)).toEqual(1.0);
  });
  it('is symmetric at midpoint', () => {
    assertApprox(easeInOutExponential(0.5), 0.5);
  });
});

describe('easeOutExponential', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeOutExponential(0.0), 0.0);
    expect(easeOutExponential(1.0)).toEqual(1.0);
  });
  it('is fast at start', () => {
    expect(easeOutExponential(0.5) > 0.5).toBe(true);
  });
});
