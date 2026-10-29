// Generated from crates/flight-color/tests/contract_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  allocateHslColor,
  allocateHsvColor,
  allocateLinearColor,
  clampLinearRgb,
  colorFromKelvin,
  computeRgbHexString,
  computeRgbaCssString,
  getColorAlpha,
  getColorContrastRatio,
  getColorLuminance,
  getColorRgb,
  getRec2020LuminanceWeights,
  getRec709LuminanceWeights,
  hslToRgb,
  hsvToRgb,
  lerpColor,
  lerpLinearColor,
  linearChannelToSrgb,
  linearRgbToOklab,
  oklabToLinearRgb,
  packColor,
  packLinearToColor,
  packOpaqueColor,
  premultiplyColorAlpha,
  rgbToHsl,
  rgbToHsv,
  setColorAlpha,
  srgbChannelToLinear,
  unpackColorRgba,
  unpackColorToLinear,
  unpremultiplyColorAlpha,
} from './contract.ts';

describe('contractReExports', () => {
  it('exposes all color from kelvin functions', () => {
    const Color = colorFromKelvin(6500.0);
  });
  it('exposes all hsl functions and types', () => {
    let hsl = allocateHslColor();
    rgbToHsl(hsl, 0xff0000ff);
    let out = new Float32Array(4).fill(0.0);
    hslToRgb(out, hsl.h, hsl.s, hsl.l);
  });
  it('exposes all hsv functions and types', () => {
    let hsv = allocateHsvColor();
    rgbToHsv(hsv, 0x00ff00ff);
    let out = new Float32Array(4).fill(0.0);
    hsvToRgb(out, hsv.h, hsv.s, hsv.v);
  });
  it('exposes all lerp functions', () => {
    const C = lerpColor(0x000000ff, 0xffffffff, 0.5);
    let out = allocateLinearColor();
    const start = allocateLinearColor();
    const end = allocateLinearColor();
    lerpLinearColor(out, start, end, 0.5);
  });
  it('exposes all luminance functions', () => {
    const Lum = getColorLuminance(0xffffffff);
    const Ratio = getColorContrastRatio(0xffffffff, 0x000000ff);
    let w709 = new Float32Array(3).fill(0.0);
    getRec709LuminanceWeights(w709);
    let w2020 = new Float32Array(3).fill(0.0);
    getRec2020LuminanceWeights(w2020);
  });
  it('exposes all oklab functions', () => {
    let lab = new Float32Array(3).fill(0.0);
    linearRgbToOklab(lab, 1.0, 0.0, 0.0);
    let rgb = new Float32Array(3).fill(0.0);
    oklabToLinearRgb(rgb, lab[0], lab[1], lab[2]);
    const [r, g, b] = [rgb[0], rgb[1], rgb[2]] as const;
    clampLinearRgb(rgb, r, g, b);
  });
  it('exposes all pack functions and types', () => {
    let linear = allocateLinearColor();
    unpackColorToLinear(linear, 0xff8800ff);
    const Packed = packLinearToColor(linear);
    const Packed2 = packColor(1.0, 0.0, 0.0, 1.0);
    const Opaque = packOpaqueColor(0xff8800);
    const Alpha = getColorAlpha(0xff8800ff);
    const Rgb = getColorRgb(0xff8800ff);
    const WithAlpha = setColorAlpha(0xff8800ff, 0.5);
    const Hex = computeRgbHexString(0xff8800);
    const Css = computeRgbaCssString(0xff8800ff);
    let rgba = new Float32Array(4).fill(0.0);
    unpackColorRgba(rgba, 0xff8800ff);
  });
  it('exposes all premultiply functions', () => {
    const Pm = premultiplyColorAlpha(0xff880080);
    const Upm = unpremultiplyColorAlpha(0xff880080);
  });
  it('exposes all srgb transfer functions', () => {
    const S = linearChannelToSrgb(0.5);
    const L = srgbChannelToLinear(0.5);
  });
});
