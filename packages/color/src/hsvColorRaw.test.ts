// Generated from crates/flight-color/tests/hsv_color_raw_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { allocateHsvColor, hsvToRgb, rgbToHsv } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-3, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

function assertApproxTight(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-5, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('allocateHsvColor', () => {
  it('allocates a zeroed three component hsv color', () => {
    const c = allocateHsvColor();
    expect(c.h).toEqual(0.0);
    expect(c.s).toEqual(0.0);
    expect(c.v).toEqual(0.0);
  });
});

describe('hsvToRgb', () => {
  it('produces achromatic rgb for saturation zero', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 1.0]);
    hsvToRgb(out, 0.0, 0.0, 0.6);
    assertApprox(out[0], 0.6);
    assertApprox(out[1], 0.6);
    assertApprox(out[2], 0.6);
  });
  it('produces pure red for h0 s1 v1', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 1.0]);
    hsvToRgb(out, 0.0, 1.0, 1.0);
    assertApproxTight(out[0], 1.0);
    assertApproxTight(out[1], 0.0);
    assertApproxTight(out[2], 0.0);
  });
  it('round trips with rgb to hsv for pure green', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 1.0]);
    hsvToRgb(out, 120.0, 1.0, 1.0);
    assertApproxTight(out[0], 0.0);
    assertApproxTight(out[1], 1.0);
    assertApproxTight(out[2], 0.0);
  });
  it('converts hue 90 through its color wheel sector', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 0.75]);
    hsvToRgb(out, 90.0, 1.0, 1.0);
    assertApproxTight(out[0], 0.5);
    assertApproxTight(out[1], 1.0);
    assertApproxTight(out[2], 0.0);
    expect(out[3]).toEqual(0.75);
  });
  it('converts hue 210 through its color wheel sector', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 0.75]);
    hsvToRgb(out, 210.0, 1.0, 1.0);
    assertApproxTight(out[0], 0.0);
    assertApproxTight(out[1], 0.5);
    assertApproxTight(out[2], 1.0);
    expect(out[3]).toEqual(0.75);
  });
  it('converts hue 270 through its color wheel sector', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 0.75]);
    hsvToRgb(out, 270.0, 1.0, 1.0);
    assertApproxTight(out[0], 0.5);
    assertApproxTight(out[1], 0.0);
    assertApproxTight(out[2], 1.0);
    expect(out[3]).toEqual(0.75);
  });
  it('converts hue 330 through its color wheel sector', () => {
    let out = new Float32Array([0.0, 0.0, 0.0, 0.75]);
    hsvToRgb(out, 330.0, 1.0, 1.0);
    assertApproxTight(out[0], 1.0);
    assertApproxTight(out[1], 0.0);
    assertApproxTight(out[2], 0.5);
    expect(out[3]).toEqual(0.75);
  });
});

describe('rgbToHsv', () => {
  it('converts pure red to hue 0 s 1 v 1', () => {
    let out = allocateHsvColor();
    rgbToHsv(out, 0xff0000ff);
    assertApprox(out.h, 0.0);
    assertApproxTight(out.s, 1.0);
    assertApproxTight(out.v, 1.0);
  });
  it('converts black to s 0 v 0', () => {
    let out = allocateHsvColor();
    rgbToHsv(out, 0x000000ff);
    expect(out.s).toEqual(0.0);
    assertApproxTight(out.v, 0.0);
  });
  it('converts white to s 0 v 1', () => {
    let out = allocateHsvColor();
    rgbToHsv(out, 0xffffffff);
    expect(out.s).toEqual(0.0);
    assertApproxTight(out.v, 1.0);
  });
  it('converts pure green to hue 120', () => {
    let out = allocateHsvColor();
    rgbToHsv(out, 0x00ff00ff);
    assertApprox(out.h, 120.0);
    assertApproxTight(out.s, 1.0);
    assertApproxTight(out.v, 1.0);
  });
  it('converts pure blue to hue 240', () => {
    let out = allocateHsvColor();
    rgbToHsv(out, 0x0000ffff);
    assertApprox(out.h, 240.0);
    assertApproxTight(out.s, 1.0);
    assertApproxTight(out.v, 1.0);
  });
  it('converts magenta to hue 300', () => {
    let out = allocateHsvColor();
    rgbToHsv(out, 0xff00ffff);
    assertApprox(out.h, 300.0);
    assertApproxTight(out.s, 1.0);
    assertApproxTight(out.v, 1.0);
  });
});
