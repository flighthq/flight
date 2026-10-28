// Generated from crates/flight-color/tests/oklab_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { clampLinearRgb, linearRgbToOklab, oklabToLinearRgb } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-3, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

function assertApproxTight(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('clampLinearRgb', () => {
  it('explicitly clamps out of gamut channels to the displayable linear srgb range', () => {
    let rgb = new Float32Array(3).fill(0.0);
    clampLinearRgb(rgb, 1.25, -0.2, 0.5);
    expect(rgb[0]).toEqual(1.0);
    expect(rgb[1]).toEqual(0.0);
    expect(rgb[2]).toEqual(0.5);
  });
});

describe('linearRgbToOklab', () => {
  it('maps linear white to l near 1 a near 0 b near 0', () => {
    let out = new Float32Array(3).fill(0.0);
    linearRgbToOklab(out, 1.0, 1.0, 1.0);
    assertApprox(out[0], 1.0);
    assertApproxTight(out[1], 0.0);
    assertApproxTight(out[2], 0.0);
  });
  it('maps black to the origin', () => {
    let out = new Float32Array(3).fill(0.0);
    linearRgbToOklab(out, 0.0, 0.0, 0.0);
    expect(out[0]).toEqual(0.0);
    expect(out[1]).toEqual(0.0);
    expect(out[2]).toEqual(0.0);
  });
});

describe('oklabToLinearRgb', () => {
  it('round trips linear rgb through oklab for a saturated color', () => {
    let lab = new Float32Array(3).fill(0.0);
    linearRgbToOklab(lab, 0.5, 0.1, 0.8);
    let rgb = new Float32Array(3).fill(0.0);
    oklabToLinearRgb(rgb, lab[0], lab[1], lab[2]);
    assertApproxTight(rgb[0], 0.5);
    assertApproxTight(rgb[1], 0.1);
    assertApproxTight(rgb[2], 0.8);
  });
  it('preserves negative and greater than one channels for out of gamut oklab', () => {
    let rgb = new Float32Array(3).fill(0.0);
    oklabToLinearRgb(rgb, 0.5, 1.0, 0.0);
    expect(rgb.some((c) => c < 0.0)).toBe(true);
    expect(rgb.some((c) => c > 1.0)).toBe(true);
  });
  it('round trips out of gamut linear rgb without silently clamping channels', () => {
    let lab = new Float32Array(3).fill(0.0);
    linearRgbToOklab(lab, 1.1, -0.05, 0.2);
    let rgb = new Float32Array(3).fill(0.0);
    oklabToLinearRgb(rgb, lab[0], lab[1], lab[2]);
    assertApproxTight(rgb[0], 1.1);
    assertApproxTight(rgb[1], -0.05);
    assertApproxTight(rgb[2], 0.2);
  });
});
