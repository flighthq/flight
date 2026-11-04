// Generated from crates/flight-easing/tests/ease_power_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  easeInOutCubic,
  easeInOutPower,
  easeInPower,
  easeInQuadratic,
  easeInQuintic,
  easeOutPower,
  easeOutQuadratic,
} from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInOutPower', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    const f = easeInOutPower(3.0);
    assertApprox(f(0.0), 0.0);
    assertApprox(f(1.0), 1.0);
  });
  it('passes through 0.5 at t 0.5', () => {
    const f = easeInOutPower(3.0);
    assertApprox(f(0.5), 0.5);
  });
  it('matches ease in out cubic at exponent 3', () => {
    const f = easeInOutPower(3.0);
    assertApprox(f(0.3), easeInOutCubic(0.3));
    assertApprox(f(0.7), easeInOutCubic(0.7));
  });
  it('is symmetric', () => {
    const f = easeInOutPower(4.0);
    assertApprox(f(0.3) + f(0.7), 1.0);
    assertApprox(f(0.1) + f(0.9), 1.0);
  });
});

describe('easeInPower', () => {
  it('returns 0 at t 0 and 1 at t 1 for any exponent', () => {
    for (const exp of [0.5, 1.0, 2.0, 3.0, 5.0]) {
      const f = easeInPower(exp);
      assertApprox(f(0.0), 0.0);
      assertApprox(f(1.0), 1.0);
    }
  });
  it('matches ease in quadratic at exponent 2', () => {
    const f = easeInPower(2.0);
    assertApprox(f(0.5), easeInQuadratic(0.5));
    assertApprox(f(0.3), easeInQuadratic(0.3));
  });
  it('matches ease in quintic at exponent 5', () => {
    const f = easeInPower(5.0);
    assertApprox(f(0.5), easeInQuintic(0.5));
    assertApprox(f(0.7), easeInQuintic(0.7));
  });
  it('sub linear at exponent less than 1', () => {
    const f = easeInPower(0.5);
    assertApprox(f(0.25), 0.5);
  });
  it('is monotonically increasing', () => {
    const f = easeInPower(2.5);
    let prev = f(0.0);
    for (let i = 1; i <= 20; i += 1) {
      const v = f(i / 20.0);
      expect(v > prev).toBe(true);
      prev = v;
    }
  });
});

describe('easeOutPower', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    const f = easeOutPower(2.0);
    assertApprox(f(0.0), 0.0);
    assertApprox(f(1.0), 1.0);
  });
  it('matches ease out quadratic at exponent 2', () => {
    const f = easeOutPower(2.0);
    assertApprox(f(0.5), easeOutQuadratic(0.5));
    assertApprox(f(0.8), easeOutQuadratic(0.8));
  });
  it('is monotonically increasing', () => {
    const f = easeOutPower(3.0);
    let prev = f(0.0);
    for (let i = 1; i <= 20; i += 1) {
      const v = f(i / 20.0);
      expect(v > prev).toBe(true);
      prev = v;
    }
  });
});
