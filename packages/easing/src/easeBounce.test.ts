// Generated from crates/flight-easing/tests/ease_bounce_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInBounce, easeInOutBounce, easeOutBounce } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInBounce', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeInBounce(0.0), 0.0);
    assertApprox(easeInBounce(1.0), 1.0);
  });
  it('is slow at start', () => {
    expect(easeInBounce(0.5) < 0.5).toBe(true);
  });
});

describe('easeInOutBounce', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeInOutBounce(0.0), 0.0);
    assertApprox(easeInOutBounce(1.0), 1.0);
  });
});

describe('easeOutBounce', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeOutBounce(0.0), 0.0);
    assertApprox(easeOutBounce(1.0), 1.0);
  });
  it('is fast at start', () => {
    expect(easeOutBounce(0.5) > 0.5).toBe(true);
  });
});
