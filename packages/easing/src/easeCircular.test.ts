// Generated from crates/flight-easing/tests/ease_circular_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInCircular, easeInOutCircular, easeOutCircular } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInCircular', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeInCircular(0.0), 0.0);
    assertApprox(easeInCircular(1.0), 1.0);
  });
  it('is slow at start', () => {
    expect(easeInCircular(0.5) < 0.5).toBe(true);
    assertApprox(easeInCircular(0.5), 1.0 - Math.sqrt(0.75));
  });
  it('is monotonically increasing', () => {
    let prev = easeInCircular(0.0);
    for (let i = 1; i <= 20; i += 1) {
      const value = easeInCircular(i / 20.0);
      expect(value >= prev).toBe(true);
      prev = value;
    }
  });
});

describe('easeInOutCircular', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeInOutCircular(0.0), 0.0);
    assertApprox(easeInOutCircular(1.0), 1.0);
  });
  it('is symmetric at midpoint', () => {
    assertApprox(easeInOutCircular(0.5), 0.5);
  });
});

describe('easeOutCircular', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeOutCircular(0.0), 0.0);
    assertApprox(easeOutCircular(1.0), 1.0);
  });
  it('is fast at start', () => {
    expect(easeOutCircular(0.5) > 0.5).toBe(true);
  });
});
