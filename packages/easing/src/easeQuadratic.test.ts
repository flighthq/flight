// Generated from crates/flight-easing/tests/ease_quadratic_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInOutQuadratic, easeInQuadratic, easeOutQuadratic } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInOutQuadratic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInOutQuadratic(0.0)).toEqual(0.0);
    expect(easeInOutQuadratic(1.0)).toEqual(1.0);
  });
  it('is symmetric at midpoint', () => {
    assertApprox(easeInOutQuadratic(0.5), 0.5);
  });
});

describe('easeInQuadratic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInQuadratic(0.0)).toEqual(0.0);
    expect(easeInQuadratic(1.0)).toEqual(1.0);
  });
  it('is slow at start', () => {
    expect(easeInQuadratic(0.5) < 0.5).toBe(true);
  });
});

describe('easeOutQuadratic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeOutQuadratic(0.0)).toEqual(0.0);
    expect(easeOutQuadratic(1.0)).toEqual(1.0);
  });
  it('is fast at start', () => {
    expect(easeOutQuadratic(0.5) > 0.5).toBe(true);
  });
});
