// Generated from crates/flight-color/tests/pack_color_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  allocateLinearColor,
  computeRgbHexString,
  computeRgbaCssString,
  getColorAlpha,
  getColorRgb,
  packColor,
  packLinearChannelsToColor,
  packLinearToColor,
  packOpaqueColor,
  setColorAlpha,
  unpackColorRgba,
  unpackColorToLinear,
} from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

function assertApproxTight(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-6, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('allocateLinearColor', () => {
  it('allocates a zeroed four component color', () => {
    const c = allocateLinearColor();
    expect(c.r).toEqual(0.0);
    expect(c.g).toEqual(0.0);
    expect(c.b).toEqual(0.0);
    expect(c.a).toEqual(0.0);
  });
});

describe('computeRgbaCssString', () => {
  it('preserves every channel of a packed rgba color in css form', () => {
    expect(computeRgbaCssString(0xff0000ff)).toEqual('rgba(255,0,0,1)');
    const s = computeRgbaCssString(0x00ff0080);
    expect(s.startsWith('rgba(0,255,0,0.501960'), `expected alpha near 0.5019608, got ${s}`).toBe(true);
    expect(computeRgbaCssString(0x00000000)).toEqual('rgba(0,0,0,0)');
  });
});

describe('computeRgbHexString', () => {
  it('returns a 6 digit hex string of the lower 24 bits', () => {
    expect(computeRgbHexString(0x00ff0000)).toEqual('#ff0000');
    expect(computeRgbHexString(0x0000ff00)).toEqual('#00ff00');
    expect(computeRgbHexString(0x000000ff)).toEqual('#0000ff');
    expect(computeRgbHexString(0x00000000)).toEqual('#000000');
    expect(computeRgbHexString(0x00ffffff)).toEqual('#ffffff');
  });
});

describe('getColorAlpha', () => {
  it('returns the alpha byte as a float in zero to one', () => {
    assertApprox(getColorAlpha(0x11223344), 0x44 / 0xff);
    expect(getColorAlpha(0xffffffff)).toEqual(1.0);
    expect(getColorAlpha(0xabcdef00)).toEqual(0.0);
  });
});

describe('getColorRgb', () => {
  it('drops the alpha byte returning the 24 bit rgb', () => {
    expect(getColorRgb(0xff8800ff)).toEqual(0xff8800);
    expect(getColorRgb(0x11223344)).toEqual(0x112233);
  });
  it('round trips with pack opaque color', () => {
    expect(getColorRgb(packOpaqueColor(0x3366cc))).toEqual(0x3366cc);
  });
});

describe('packColor', () => {
  it('packs white components to 0xffffffff', () => {
    expect(packColor(1.0, 1.0, 1.0, 1.0)).toEqual(0xffffffff);
  });
  it('packs black components to 0x000000ff', () => {
    expect(packColor(0.0, 0.0, 0.0, 1.0)).toEqual(0x000000ff);
  });
  it('clamps out of range values', () => {
    expect(packColor(2.0, -1.0, 0.5, 1.0)).toEqual(packColor(1.0, 0.0, 0.5, 1.0));
  });
});

describe('packLinearChannelsToColor', () => {
  it('matches the entity pack path without allocating', () => {
    let color = allocateLinearColor();
    color.r = 0.25;
    color.g = 0.5;
    color.b = 0.75;
    color.a = 0.875;
    expect(packLinearChannelsToColor(color.r, color.g, color.b, color.a)).toEqual(packLinearToColor(color));
  });
});

describe('packLinearToColor', () => {
  it('is the inverse of unpack color to linear for white', () => {
    let out = allocateLinearColor();
    unpackColorToLinear(out, 0xffffffff);
    expect(packLinearToColor(out)).toEqual(0xffffffff);
  });
  it('is the inverse of unpack color to linear for black opaque', () => {
    let out = allocateLinearColor();
    unpackColorToLinear(out, 0x000000ff);
    expect(packLinearToColor(out)).toEqual(0x000000ff);
  });
  it('passes alpha through without gamma encoding', () => {
    const color: number = 0x00000080;
    let out = allocateLinearColor();
    unpackColorToLinear(out, color);
    const repacked = packLinearToColor(out);
    expect(repacked & 0xff).toEqual(0x80);
  });
  it('round trips a mid gray color within 1 lsb', () => {
    const color: number = 0x808080ff;
    let out = allocateLinearColor();
    unpackColorToLinear(out, color);
    const repacked = packLinearToColor(out);
    const origR = (color >>> 24) & 0xff;
    const repR = (repacked >> 24) & 0xff;
    expect(Math.abs((repR | 0) - (origR | 0)) <= 1, `expected within 1 LSB, got orig=${origR} rep=${repR}`).toBe(true);
  });
  it('delegates to the allocation free scalar seam', () => {
    let color = allocateLinearColor();
    color.r = 0.25;
    color.g = 0.5;
    color.b = 0.75;
    color.a = 0.875;
    expect(packLinearToColor(color)).toEqual(packLinearChannelsToColor(color.r, color.g, color.b, color.a));
  });
});

describe('packOpaqueColor', () => {
  it('widens 24 bit rgb to 32 bit rgba with full opacity', () => {
    expect(packOpaqueColor(0x336699)).toEqual(0x336699ff);
    expect(packOpaqueColor(0x000000)).toEqual(0x000000ff);
    expect(packOpaqueColor(0xffffff)).toEqual(0xffffffff);
  });
  it('masks off bits above 24', () => {
    expect(packOpaqueColor(0xaa336699)).toEqual(0x336699ff);
  });
  it('returns an unsigned 32 bit integer', () => {
    expect(packOpaqueColor(0xffffff) > 0).toBe(true);
  });
});

describe('setColorAlpha', () => {
  it('replaces the alpha byte from a float leaving rgb intact', () => {
    expect(setColorAlpha(0xff8800ff, 0.0)).toEqual(0xff880000);
    expect(setColorAlpha(0xff880000, 1.0)).toEqual(0xff8800ff);
  });
  it('clamps and rounds to 8 bits', () => {
    expect(setColorAlpha(0x112233ff, 2.0)).toEqual(0x112233ff);
    const alpha = getColorAlpha(setColorAlpha(0x112233ff, 0.5));
    const diff = Math.abs(alpha - 0.5);
    expect(diff < 0.005, `expected alpha near 0.5, got ${alpha} (diff: ${diff})`).toBe(true);
  });
});

describe('unpackColorRgba', () => {
  it('extracts white as all ones', () => {
    let out = new Float32Array(4).fill(0.0);
    unpackColorRgba(out, 0xffffffff);
    assertApproxTight(out[0], 1.0);
    assertApproxTight(out[1], 1.0);
    assertApproxTight(out[2], 1.0);
    assertApproxTight(out[3], 1.0);
  });
  it('does not gamma decode mid srgb stays above the linear midpoint', () => {
    let out = new Float32Array(4).fill(0.0);
    unpackColorRgba(out, 0x808080ff);
    assertApprox(out[0], 0x80 / 0xff);
  });
});

describe('unpackColorToLinear', () => {
  it('decodes white and black exactly at the endpoints', () => {
    let out = allocateLinearColor();
    unpackColorToLinear(out, 0xffffffff);
    expect(out.r).toEqual(1.0);
    expect(out.g).toEqual(1.0);
    expect(out.b).toEqual(1.0);
    expect(out.a).toEqual(1.0);
    unpackColorToLinear(out, 0x000000ff);
    expect(out.r).toEqual(0.0);
    expect(out.g).toEqual(0.0);
    expect(out.b).toEqual(0.0);
    expect(out.a).toEqual(1.0);
  });
  it('passes alpha through linearly without gamma decode', () => {
    let out = allocateLinearColor();
    unpackColorToLinear(out, 0x00000080);
    assertApproxTight(out.a, 0x80 / 0xff);
  });
  it('gamma decodes rgb so mid srgb is below the linear midpoint', () => {
    let out = allocateLinearColor();
    unpackColorToLinear(out, 0x808080ff);
    assertApprox(out.r, 0.21586);
    expect(out.r).toEqual(out.g);
    expect(out.g).toEqual(out.b);
  });
});
