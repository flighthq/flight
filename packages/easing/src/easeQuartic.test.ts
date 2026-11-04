// Generated from crates/flight-easing/tests/ease_quartic_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInOutQuartic, easeInQuartic, easeOutQuartic } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInOutQuartic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInOutQuartic(0.0)).toEqual(0.0);
    expect(easeInOutQuartic(1.0)).toEqual(1.0);
  });
  it('is symmetric at midpoint', () => {
    assertApprox(easeInOutQuartic(0.5), 0.5);
  });
});

describe('easeInQuartic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInQuartic(0.0)).toEqual(0.0);
    expect(easeInQuartic(1.0)).toEqual(1.0);
  });
  it('is slow at start', () => {
    expect(easeInQuartic(0.5) < 0.5).toBe(true);
  });
});

describe('easeOutQuartic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeOutQuartic(0.0)).toEqual(0.0);
    expect(easeOutQuartic(1.0)).toEqual(1.0);
  });
  it('is fast at start', () => {
    expect(easeOutQuartic(0.5) > 0.5).toBe(true);
  });
});
