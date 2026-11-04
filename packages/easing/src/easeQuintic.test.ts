// Generated from crates/flight-easing/tests/ease_quintic_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInOutQuintic, easeInQuintic, easeOutQuintic } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInOutQuintic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInOutQuintic(0.0)).toEqual(0.0);
    expect(easeInOutQuintic(1.0)).toEqual(1.0);
  });
  it('is symmetric at midpoint', () => {
    assertApprox(easeInOutQuintic(0.5), 0.5);
  });
});

describe('easeInQuintic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInQuintic(0.0)).toEqual(0.0);
    expect(easeInQuintic(1.0)).toEqual(1.0);
  });
  it('is slow at start', () => {
    expect(easeInQuintic(0.5) < 0.5).toBe(true);
  });
});

describe('easeOutQuintic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeOutQuintic(0.0)).toEqual(0.0);
    expect(easeOutQuintic(1.0)).toEqual(1.0);
  });
  it('is fast at start', () => {
    expect(easeOutQuintic(0.5) > 0.5).toBe(true);
  });
});
