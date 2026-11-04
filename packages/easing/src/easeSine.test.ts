// Generated from crates/flight-easing/tests/ease_sine_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInOutSine, easeInSine, easeOutSine } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInOutSine', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeInOutSine(0.0), 0.0);
    assertApprox(easeInOutSine(1.0), 1.0);
  });
  it('is symmetric at midpoint', () => {
    assertApprox(easeInOutSine(0.5), 0.5);
  });
});

describe('easeInSine', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeInSine(0.0), 0.0);
    assertApprox(easeInSine(1.0), 1.0);
  });
  it('is slow at start', () => {
    expect(easeInSine(0.5) < 0.5).toBe(true);
  });
});

describe('easeOutSine', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeOutSine(0.0), 0.0);
    assertApprox(easeOutSine(1.0), 1.0);
  });
  it('is fast at start', () => {
    expect(easeOutSine(0.5) > 0.5).toBe(true);
  });
});
