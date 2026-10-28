// Generated from crates/flight-color/tests/luminance_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  getColorContrastRatio,
  getColorLuminance,
  getRec2020LuminanceWeights,
  getRec709LuminanceWeights,
} from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

function assertApproxTight(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-6, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('getColorContrastRatio', () => {
  it('returns 21 for black on white', () => {
    assertApprox(getColorContrastRatio(0xffffffff, 0x000000ff), 21.0);
  });
  it('returns 1 for identical colors', () => {
    assertApprox(getColorContrastRatio(0x808080ff, 0x808080ff), 1.0);
  });
  it('is symmetric order of arguments does not matter', () => {
    const ratio1 = getColorContrastRatio(0xffffffff, 0x808080ff);
    const ratio2 = getColorContrastRatio(0x808080ff, 0xffffffff);
    assertApproxTight(ratio1, ratio2);
  });
});

describe('getColorLuminance', () => {
  it('returns 1 for white', () => {
    assertApproxTight(getColorLuminance(0xffffffff), 1.0);
  });
  it('returns 0 for black', () => {
    assertApproxTight(getColorLuminance(0x000000ff), 0.0);
  });
  it('ignores the alpha channel', () => {
    expect(getColorLuminance(0xffffffff)).toEqual(getColorLuminance(0xffffff00));
  });
  it('matches expected rec 709 value for mid gray srgb', () => {
    assertApprox(getColorLuminance(0x808080ff), 0.21586);
  });
});

describe('getRec2020LuminanceWeights', () => {
  it('writes the itu r bt2020 weights that sum to 1', () => {
    let out = new Float32Array(3).fill(0.0);
    getRec2020LuminanceWeights(out);
    assertApproxTight(out[0], 0.2627);
    assertApproxTight(out[1], 0.678);
    assertApproxTight(out[2], 0.0593);
    assertApproxTight(out[0] + out[1] + out[2], 1.0);
  });
});

describe('getRec709LuminanceWeights', () => {
  it('writes the itu r bt709 weights that sum to 1', () => {
    let out = new Float32Array(3).fill(0.0);
    getRec709LuminanceWeights(out);
    assertApproxTight(out[0], 0.2126);
    assertApproxTight(out[1], 0.7152);
    assertApproxTight(out[2], 0.0722);
    assertApproxTight(out[0] + out[1] + out[2], 1.0);
  });
});
