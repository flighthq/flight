// Generated from crates/flight-math/tests/interpolation_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { inverseLerp, lerp, remap, smoothStep, step } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  const limit = Math.max(0.05, 4 * Math.pow(2, -23) * Math.max(Math.abs(expected), 1));
  expect(diff <= limit, `expected ${expected}, got ${actual} (diff: ${diff}, limit: ${limit})`).toBe(true);
}

describe('inverseLerp', () => {
  it('returns 0 when value equals a', () => {
    expect(inverseLerp(0, 10, 0)).toEqual(0);
  });
  it('returns 1 when value equals b', () => {
    expect(inverseLerp(0, 10, 10)).toEqual(1);
  });
  it('returns 0.5 for the midpoint', () => {
    expect(inverseLerp(0, 10, 5)).toEqual(0.5);
  });
  it('returns 0 when a equals b to avoid division by zero', () => {
    expect(inverseLerp(5, 5, 5)).toEqual(0);
  });
  it('works with negative ranges', () => {
    expect(inverseLerp(-10, 10, 0)).toEqual(0.5);
  });
});

describe('lerp', () => {
  it('returns a when t is 0', () => {
    expect(lerp(0, 10, 0)).toEqual(0);
  });
  it('returns b when t is 1', () => {
    expect(lerp(0, 10, 1)).toEqual(10);
  });
  it('returns the midpoint for t half', () => {
    expect(lerp(0, 10, 0.5)).toEqual(5);
  });
  it('extrapolates when t is outside 0 1', () => {
    expect(lerp(0, 10, 2)).toEqual(20);
    expect(lerp(0, 10, -1)).toEqual(-10);
  });
  it('works with negative values', () => {
    expect(lerp(-10, 10, 0.5)).toEqual(0);
  });
});

describe('remap', () => {
  it('maps a value from one range to another', () => {
    expect(remap(5, 0, 10, 0, 100)).toEqual(50);
  });
  it('maps the minimum input to the minimum output', () => {
    expect(remap(0, 0, 10, 50, 150)).toEqual(50);
  });
  it('maps the maximum input to the maximum output', () => {
    expect(remap(10, 0, 10, 50, 150)).toEqual(150);
  });
  it('returns out min when in min equals in max', () => {
    expect(remap(5, 5, 5, 0, 100)).toEqual(0);
  });
  it('works with inverted output ranges', () => {
    expect(remap(5, 0, 10, 100, 0)).toEqual(50);
  });
});

describe('smoothStep', () => {
  it('returns 0 at the lower edge', () => {
    expect(smoothStep(0, 1, 0)).toEqual(0);
  });
  it('returns 1 at the upper edge', () => {
    expect(smoothStep(0, 1, 1)).toEqual(1);
  });
  it('returns 0.5 at the midpoint', () => {
    expect(smoothStep(0, 1, 0.5)).toEqual(0.5);
  });
  it('returns 0 for x below the lower edge', () => {
    expect(smoothStep(0, 1, -1)).toEqual(0);
  });
  it('returns 1 for x above the upper edge', () => {
    expect(smoothStep(0, 1, 2)).toEqual(1);
  });
  it('has zero derivative at the edges', () => {
    const h = 0.001;
    const dLow = (smoothStep(0, 1, h) - smoothStep(0, 1, 0)) / h;
    const dHigh = (smoothStep(0, 1, 1) - smoothStep(0, 1, 1 - h)) / h;
    assertApprox(dLow, 0);
    assertApprox(dHigh, 0);
  });
});

describe('step', () => {
  it('returns 0 when x is less than edge', () => {
    expect(step(0.5, 0.3)).toEqual(0);
  });
  it('returns 1 when x equals edge', () => {
    expect(step(0.5, 0.5)).toEqual(1);
  });
  it('returns 1 when x is greater than edge', () => {
    expect(step(0.5, 0.7)).toEqual(1);
  });
});
