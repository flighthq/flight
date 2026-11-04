// Generated from crates/flight-easing/tests/ease_back_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInBack, easeInOutBack, easeOutBack } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeInBack', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeInBack(0.0), 0.0);
    assertApprox(easeInBack(1.0), 1.0);
  });
  it('undershoots below 0 before settling', () => {
    expect(easeInBack(0.3) < 0.0).toBe(true);
  });
});

describe('easeInOutBack', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeInOutBack(0.0), 0.0);
    assertApprox(easeInOutBack(1.0), 1.0);
  });
});

describe('easeOutBack', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    assertApprox(easeOutBack(0.0), 0.0);
    assertApprox(easeOutBack(1.0), 1.0);
  });
  it('overshoots past 1 before settling', () => {
    expect(easeOutBack(0.7) > 1.0).toBe(true);
  });
});
