// Generated from crates/flight-easing/tests/ease_cubic_bezier_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeCubicBezier } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeCubicBezier', () => {
  it('returns exact endpoints regardless of control points', () => {
    const ease = easeCubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0)).toEqual(0);
    expect(ease(1)).toEqual(1);
  });
  it('clamps out of range input to the endpoints', () => {
    const ease = easeCubicBezier(0.42, 0, 0.58, 1);
    expect(ease(-0.5)).toEqual(0);
    expect(ease(1.5)).toEqual(1);
  });
  it('approximates the identity for diagonal control points', () => {
    const linear = easeCubicBezier(0, 0, 1, 1);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      assertApprox(linear(t), t);
    }
  });
  it('matches the css ease curve at a sampled point', () => {
    const ease = easeCubicBezier(0.25, 0.1, 0.25, 1);
    const val = ease(0.5);
    expect(Math.abs(val - 0.8024) < 0.01).toBe(true);
    expect(val > 0.5).toBe(true);
  });
  it('is monotonically non decreasing across the interval', () => {
    const ease = easeCubicBezier(0.25, 0.1, 0.25, 1);
    let prev = ease(0);
    for (let i = 1; i <= 50; i++) {
      const value = ease(i / 50);
      expect(value >= prev - 1e-6).toBe(true);
      prev = value;
    }
  });
  it('inverts x correctly for an asymmetric curve', () => {
    const ease = easeCubicBezier(0.42, 0, 0.58, 1);
    const val = ease(0.5);
    expect(Math.abs(val - 0.5) < 0.01).toBe(true);
  });
});
