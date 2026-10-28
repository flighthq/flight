// Generated from crates/flight-easing/tests/ease_cubic_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInCubic, easeInOutCubic, easeOutCubic } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInCubic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInCubic(0.0)).toEqual(0.0);
    expect(easeInCubic(1.0)).toEqual(1.0);
  });
  it('is slow at start', () => {
    expect(easeInCubic(0.5) < 0.5).toBe(true);
  });
});

describe('easeInOutCubic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInOutCubic(0.0)).toEqual(0.0);
    expect(easeInOutCubic(1.0)).toEqual(1.0);
  });
  it('is symmetric at midpoint', () => {
    assertApprox(easeInOutCubic(0.5), 0.5);
  });
});

describe('easeOutCubic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeOutCubic(0.0)).toEqual(0.0);
    expect(easeOutCubic(1.0)).toEqual(1.0);
  });
  it('is fast at start', () => {
    expect(easeOutCubic(0.5) > 0.5).toBe(true);
  });
});
