// Generated from crates/flight-easing/tests/ease_combinators_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  easeClamp,
  easeClampOutput,
  easeInCubic,
  easeInvert,
  easeMirror,
  easeOutCubic,
  easeReverse,
  easeScaleOutput,
} from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

function constantNegHalf(_t: number): number {
  return -0.5;
}

function constantOnePointFive(_t: number): number {
  return 1.5;
}

describe('easeClamp', () => {
  it('passes through values already in 0 1', () => {
    const clamped = easeClamp(easeInCubic);
    assertApprox(clamped(0.0), easeInCubic(0.0));
    assertApprox(clamped(0.5), easeInCubic(0.5));
    assertApprox(clamped(1.0), easeInCubic(1.0));
  });
  it('clamps negative t to 0', () => {
    const clamped = easeClamp(easeInCubic);
    assertApprox(clamped(-0.5), easeInCubic(0.0));
  });
  it('clamps t above 1 to 1', () => {
    const clamped = easeClamp(easeInCubic);
    assertApprox(clamped(1.5), easeInCubic(1.0));
  });
  it('is safe when composed', () => {
    const double = easeClamp(easeClamp(easeInCubic));
    assertApprox(double(-1.0), easeInCubic(0.0));
    assertApprox(double(2.0), easeInCubic(1.0));
  });
});

describe('easeClampOutput', () => {
  it('does not clamp when output is within range', () => {
    const f = easeClampOutput(easeInCubic, 0.0, 1.0);
    assertApprox(f(0.5), easeInCubic(0.5));
  });
  it('clamps output below min', () => {
    const below = easeClampOutput(constantNegHalf, 0.0, 1.0);
    expect(below(0.5)).toEqual(0.0);
  });
  it('clamps output above max', () => {
    const above = easeClampOutput(constantOnePointFive, 0.0, 1.0);
    expect(above(0.5)).toEqual(1.0);
  });
  it('respects custom range', () => {
    const f = easeClampOutput(easeInCubic, 0.2, 0.8);
    expect(f(0.0)).toEqual(0.2);
    expect(f(1.0)).toEqual(0.8);
  });
});

describe('easeInvert', () => {
  it('maps 0 to 1 and 1 to 0', () => {
    const inv = easeInvert(easeInCubic);
    assertApprox(inv(0.0), 1.0);
    assertApprox(inv(1.0), 0.0);
  });
  it('is the vertical mirror', () => {
    const inv = easeInvert(easeInCubic);
    assertApprox(inv(0.5), 1.0 - easeInCubic(0.5));
    assertApprox(inv(0.3), 1.0 - easeInCubic(0.3));
  });
  it('double inversion is the identity', () => {
    const id = easeInvert(easeInvert(easeInCubic));
    assertApprox(id(0.4), easeInCubic(0.4));
  });
});

describe('easeMirror', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    const f = easeMirror(easeInCubic);
    assertApprox(f(0.0), 0.0);
    assertApprox(f(1.0), 1.0);
  });
  it('passes through 0.5 at t 0.5', () => {
    const f = easeMirror(easeInCubic);
    assertApprox(f(0.5), 0.5);
  });
  it('is symmetric', () => {
    const f = easeMirror(easeInCubic);
    assertApprox(f(0.3) + f(0.7), 1.0);
    assertApprox(f(0.1) + f(0.9), 1.0);
  });
});

describe('easeReverse', () => {
  it('converts an in curve to an out curve', () => {
    const reversed = easeReverse(easeInCubic);
    assertApprox(reversed(0.3), 1.0 - easeInCubic(0.7));
    assertApprox(reversed(0.7), 1.0 - easeInCubic(0.3));
  });
  it('returns 0 at t 0 and 1 at t 1', () => {
    const reversed = easeReverse(easeInCubic);
    assertApprox(reversed(0.0), 0.0);
    assertApprox(reversed(1.0), 1.0);
  });
  it('ease reverse of ease in cubic approximates ease out cubic', () => {
    const reversed = easeReverse(easeInCubic);
    assertApprox(reversed(0.5), easeOutCubic(0.5));
    assertApprox(reversed(0.3), easeOutCubic(0.3));
  });
  it('double reverse is the identity', () => {
    const id = easeReverse(easeReverse(easeInCubic));
    assertApprox(id(0.4), easeInCubic(0.4));
  });
});

describe('easeScaleOutput', () => {
  it('maps 0 1 output to from value to value', () => {
    const f = easeScaleOutput(easeInCubic, 100.0, 300.0);
    assertApprox(f(0.0), 100.0);
    assertApprox(f(1.0), 300.0);
    assertApprox(f(0.5), 100.0 + easeInCubic(0.5) * 200.0);
  });
  it('handles inverted ranges', () => {
    const f = easeScaleOutput(easeInCubic, 300.0, 100.0);
    assertApprox(f(0.0), 300.0);
    assertApprox(f(1.0), 100.0);
  });
  it('is identity when range is 0 to 1', () => {
    const f = easeScaleOutput(easeInCubic, 0.0, 1.0);
    assertApprox(f(0.5), easeInCubic(0.5));
  });
});
