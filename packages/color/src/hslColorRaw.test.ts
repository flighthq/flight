// Generated from crates/flight-color/tests/hsl_color_raw_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { allocateHslColor, hslToRgb, rgbToHsl } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-3, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

function assertApproxTight(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-5, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('allocateHslColor', () => {
  it('allocates a zeroed three component hsl color', () => {
    const c = allocateHslColor();
    expect(c.h).toEqual(0.0);
    expect(c.s).toEqual(0.0);
    expect(c.l).toEqual(0.0);
  });
});

describe('hslToRgb', () => {
  it('produces achromatic rgb for saturation zero', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 1.0]);
    hslToRgb(out, 0.0, 0.0, 0.5);
    assertApprox(out[0], 0.5);
    assertApprox(out[1], 0.5);
    assertApprox(out[2], 0.5);
  });
  it('round trips with rgb to hsl for a primary color', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 1.0]);
    hslToRgb(out, 0.0, 1.0, 0.5);
    assertApproxTight(out[0], 1.0);
    assertApproxTight(out[1], 0.0);
    assertApproxTight(out[2], 0.0);
  });
  it('does not modify out 3 alpha', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 0.75]);
    hslToRgb(out, 120.0, 1.0, 0.5);
    expect(out[3]).toEqual(0.75);
  });
});

describe('rgbToHsl', () => {
  it('converts pure red to hue 0 s 1 l half', () => {
    let out = allocateHslColor();
    rgbToHsl(out, 4278190335);
    assertApprox(out.h, 0.0);
    assertApproxTight(out.s, 1.0);
    assertApproxTight(out.l, 0.5);
  });
  it('converts white to hue 0 s 0 l 1', () => {
    let out = allocateHslColor();
    rgbToHsl(out, 4294967295);
    expect(out.h).toEqual(0.0);
    expect(out.s).toEqual(0.0);
    assertApproxTight(out.l, 1.0);
  });
  it('converts black to hue 0 s 0 l 0', () => {
    let out = allocateHslColor();
    rgbToHsl(out, 255);
    expect(out.h).toEqual(0.0);
    expect(out.s).toEqual(0.0);
    assertApproxTight(out.l, 0.0);
  });
  it('converts a green dominant color', () => {
    let out = allocateHslColor();
    rgbToHsl(out, 16711935);
    assertApprox(out.h, 120.0);
    assertApproxTight(out.s, 1.0);
    assertApproxTight(out.l, 0.5);
  });
  it('wraps a red dominant hue when blue exceeds green', () => {
    let out = allocateHslColor();
    rgbToHsl(out, 4278255615);
    assertApprox(out.h, 300.0);
    assertApproxTight(out.s, 1.0);
    assertApproxTight(out.l, 0.5);
  });
  it('uses the high lightness saturation formula', () => {
    let out = allocateHslColor();
    rgbToHsl(out, 4286611711);
    assertApprox(out.h, 0.0);
    assertApproxTight(out.s, 1.0);
    assertApproxTight(out.l, 0.75098);
  });
  it('round trips with hsl to rgb within 1 lsb', () => {
    let hsl = allocateHslColor();
    rgbToHsl(hsl, 1015723519);
    let rgb = new Float32Array([0.0, 0.0, 0.0, 1.0]);
    hslToRgb(rgb, hsl.h, hsl.s, hsl.l);
    const repacked =
      ((Math.round(rgb[0] * 255.0) >>> 0) << 24) |
      ((Math.round(rgb[1] * 255.0) >>> 0) << 16) |
      ((Math.round(rgb[2] * 255.0) >>> 0) << 8) |
      255;
    const orig: number = 1015723519;
    const origR = (orig >>> 24) & 255;
    const repR = (repacked >> 24) & 255;
    expect(Math.abs((repR | 0) - (origR | 0)) <= 1, `expected within 1 LSB, got orig=${origR} rep=${repR}`).toBe(true);
  });
});
