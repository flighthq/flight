// Generated from crates/flight-math/tests/interpolation_advanced_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { damp, lerpAngle, moveTowards, pingPong, repeat, smootherStep } from './contract.ts';

const PI = Math.PI;

function assertClose(actual: number, expected: number, digits: number): void {
  const diff = Math.abs(actual - expected);
  const tsBound = 0.5 * Math.pow(10.0, -digits);
  const limit = Math.max(tsBound, 4.0 * Math.pow(2, -23) * Math.max(Math.abs(expected), 1.0));
  expect(diff <= limit, `expected ${expected}, got ${actual} (diff: ${diff}, limit: ${limit})`).toBe(true);
}

describe('damp', () => {
  it('moves current toward target over time', () => {
    const result = damp(0.0, 10.0, 1.0, 1.0);
    expect(result > 0.0).toBe(true);
    expect(result < 10.0).toBe(true);
  });
  it('returns current when delta time is 0', () => {
    expect(damp(5.0, 10.0, 2.0, 0.0)).toEqual(5.0);
  });
  it('returns current when lambda is 0', () => {
    expect(damp(5.0, 10.0, 0.0, 1.0)).toEqual(5.0);
  });
  it('approaches target asymptotically', () => {
    const stepValue = damp(0.0, 1.0, 5.0, 0.1);
    expect(stepValue > 0.39).toBe(true);
    expect(stepValue < 0.41).toBe(true);
  });
  it('is frame rate independent two half steps equal one full step', () => {
    const full = damp(0.0, 1.0, 2.0, 0.2);
    const half1 = damp(0.0, 1.0, 2.0, 0.1);
    const half2 = damp(half1, 1.0, 2.0, 0.1);
    assertClose(half2, full, 10);
  });
});

describe('lerpAngle', () => {
  it('interpolates between two close angles', () => {
    const result = lerpAngle(0.0, PI / 2.0, 0.5);
    assertClose(result, PI / 4.0, 10);
  });
  it('takes the shortest arc across zero two pi', () => {
    const tau = PI * 2.0;
    const result = lerpAngle(PI * 1.9, PI * 0.1, 0.5);
    const normalised = ((result % tau) + tau) % tau;
    assertClose(normalised, 0.0, 5);
  });
  it('takes the shortest arc clockwise across zero two pi', () => {
    const result = lerpAngle(PI * 0.1, PI * 1.9, 0.5);
    assertClose(result, 0.0, 10);
  });
  it('returns a at t zero', () => {
    assertClose(lerpAngle(1.0, 2.0, 0.0), 1.0, 10);
  });
  it('returns b at t one', () => {
    assertClose(lerpAngle(1.0, 2.0, 1.0), 2.0, 10);
  });
});

describe('moveTowards', () => {
  it('moves toward target by max delta', () => {
    expect(moveTowards(0.0, 10.0, 3.0)).toEqual(3.0);
  });
  it('snaps to target when within max delta', () => {
    expect(moveTowards(9.0, 10.0, 5.0)).toEqual(10.0);
  });
  it('works when target is below current', () => {
    expect(moveTowards(10.0, 0.0, 3.0)).toEqual(7.0);
  });
  it('returns target when current equals target', () => {
    expect(moveTowards(5.0, 5.0, 1.0)).toEqual(5.0);
  });
});

describe('pingPong', () => {
  it('starts at 0', () => {
    expect(pingPong(0.0, 1.0)).toEqual(0.0);
  });
  it('reaches length at t equals length', () => {
    expect(pingPong(1.0, 1.0)).toEqual(1.0);
  });
  it('bounces back at t 1 5 times length', () => {
    assertClose(pingPong(1.5, 1.0), 0.5, 10);
  });
  it('propagates nan when length is 0', () => {
    expect(Number.isNaN(pingPong(1.0, 0.0))).toBe(true);
  });
  it('works with larger lengths', () => {
    assertClose(pingPong(3.0, 2.0), 1.0, 10);
  });
});

describe('repeat', () => {
  it('wraps t over 0 length', () => {
    assertClose(repeat(1.6, 1.0), 0.6, 10);
  });
  it('returns 0 for exact multiple', () => {
    assertClose(repeat(2.0, 1.0), 0.0, 10);
  });
  it('handles negative t', () => {
    const r = repeat(-0.3, 1.0);
    expect(r >= 0.0).toBe(true);
    expect(r < 1.0).toBe(true);
  });
  it('propagates nan when length is 0', () => {
    expect(Number.isNaN(repeat(1.0, 0.0))).toBe(true);
  });
});

describe('smootherStep', () => {
  it('returns 0 at the lower edge', () => {
    expect(smootherStep(0.0, 1.0, 0.0)).toEqual(0.0);
  });
  it('returns 1 at the upper edge', () => {
    expect(smootherStep(0.0, 1.0, 1.0)).toEqual(1.0);
  });
  it('returns 0 5 at the midpoint', () => {
    expect(smootherStep(0.0, 1.0, 0.5)).toEqual(0.5);
  });
  it('returns 0 for x below the lower edge', () => {
    expect(smootherStep(0.0, 1.0, -1.0)).toEqual(0.0);
  });
  it('returns 1 for x above the upper edge', () => {
    expect(smootherStep(0.0, 1.0, 2.0)).toEqual(1.0);
  });
  it('has zero first and second derivatives at the edges', () => {
    const h = 0.001;
    const dLow = (smootherStep(0.0, 1.0, h) - smootherStep(0.0, 1.0, 0.0)) / h;
    const dHigh = (smootherStep(0.0, 1.0, 1.0) - smootherStep(0.0, 1.0, 1.0 - h)) / h;
    assertClose(dLow, 0.0, 1);
    assertClose(dHigh, 0.0, 1);
  });
});
