// Generated from crates/flight-color/tests/srgb_transfer_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { linearChannelToSrgb, srgbChannelToLinear } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

function assertApproxTight(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-6, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('linearChannelToSrgb', () => {
  it('maps zero to zero', () => {
    expect(linearChannelToSrgb(0.0)).toEqual(0.0);
  });
  it('maps one to one', () => {
    assertApproxTight(linearChannelToSrgb(1.0), 1.0);
  });
  it('is the inverse of the srgb decode for a round trip', () => {
    const linear = 0.5;
    const srgb = linearChannelToSrgb(linear);
    assertApproxTight(srgbChannelToLinear(srgb), linear);
  });
});

describe('srgbChannelToLinear', () => {
  it('maps zero to zero and one to one', () => {
    expect(srgbChannelToLinear(0.0)).toEqual(0.0);
    assertApproxTight(srgbChannelToLinear(1.0), 1.0);
  });
  it('decodes mid srgb below the linear midpoint', () => {
    assertApprox(srgbChannelToLinear(0x80 / 0xff), 0.21586);
  });
  it('round trips with linear channel to srgb', () => {
    const srgb = 0.25;
    assertApproxTight(linearChannelToSrgb(srgbChannelToLinear(srgb)), srgb);
  });
});
