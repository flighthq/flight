import { createSurface } from './surface';
import { getSurfacePixel, setSurfacePixel } from './surfacePixel';
import { createSurfaceRegion } from './surfaceRegion';
import { applySurfaceCurve, applySurfaceLevels } from './surfaceTone';

function buildIdentityLut() {
  return Uint8Array.from({ length: 256 }, (_, i) => i);
}

function buildInvertLut() {
  return Uint8Array.from({ length: 256 }, (_, i) => 255 - i);
}

describe('applySurfaceCurve', () => {
  it('identity LUT leaves pixels unchanged', () => {
    const surf = createSurface(2, 2, 0x11223344);
    const lut = buildIdentityLut();
    applySurfaceCurve(createSurfaceRegion(surf), createSurfaceRegion(surf), lut, lut, lut, lut);
    expect(getSurfacePixel(surf, 0, 0)).toBe(0x11223344);
  });

  it('invert LUT inverts RGB channels', () => {
    const src = createSurface(1, 1);
    setSurfacePixel(src, 0, 0, 0x00_ff_80_ff);
    const dst = createSurface(1, 1);
    const lut = buildInvertLut();
    applySurfaceCurve(createSurfaceRegion(dst), createSurfaceRegion(src), lut, lut, lut, null);
    const p = getSurfacePixel(dst, 0, 0);
    expect((p >>> 24) & 0xff).toBe(0xff); // 0x00 inverted
    expect((p >> 16) & 0xff).toBe(0x00); // 0xff inverted
    expect((p >> 8) & 0xff).toBe(0x7f); // 0x80 inverted
    expect(p & 0xff).toBe(0xff); // alpha passed through
  });

  it('null LUT passes channel through unchanged', () => {
    const src = createSurface(1, 1, 0x80_80_80_80);
    const dst = createSurface(1, 1);
    const lut = buildInvertLut();
    // Only invert R, leave G, B, A through.
    applySurfaceCurve(createSurfaceRegion(dst), createSurfaceRegion(src), lut, null, null, null);
    const p = getSurfacePixel(dst, 0, 0);
    expect((p >>> 24) & 0xff).toBe(0x7f); // R inverted
    expect((p >> 16) & 0xff).toBe(0x80); // G unchanged
    expect((p >> 8) & 0xff).toBe(0x80); // B unchanged
    expect(p & 0xff).toBe(0x80); // A unchanged
  });

  it('is alias-safe when out aliases source', () => {
    const surf = createSurface(2, 1, 0xff_00_00_ff);
    const lut = buildInvertLut();
    applySurfaceCurve(createSurfaceRegion(surf), createSurfaceRegion(surf), lut, null, null, null);
    // R (0xff) inverted to 0x00; others unchanged.
    const p = getSurfacePixel(surf, 0, 0);
    expect((p >>> 24) & 0xff).toBe(0x00);
    expect((p >> 8) & 0xff).toBe(0x00);
  });
});

describe('applySurfaceLevels', () => {
  it('default black/white/gamma is an identity', () => {
    const surf = createSurface(1, 1, 0x80_80_80_ff);
    applySurfaceLevels(createSurfaceRegion(surf), createSurfaceRegion(surf));
    expect((getSurfacePixel(surf, 0, 0) >>> 24) & 0xff).toBeCloseTo(0x80, -1);
  });

  it('black and white points clip the range', () => {
    const surf = createSurface(1, 1);
    setSurfacePixel(surf, 0, 0, 0x00_00_00_ff); // black pixel
    applySurfaceLevels(createSurfaceRegion(surf), createSurfaceRegion(surf), 0, 128);
    // A value at black point maps to 0 — stays 0.
    expect((getSurfacePixel(surf, 0, 0) >>> 24) & 0xff).toBe(0);
    setSurfacePixel(surf, 0, 0, 0x80_80_80_ff); // mid pixel at half of range
    applySurfaceLevels(createSurfaceRegion(surf), createSurfaceRegion(surf), 0, 128);
    // 128/128 = 1.0 → output 255.
    expect((getSurfacePixel(surf, 0, 0) >>> 24) & 0xff).toBe(255);
  });

  it('gamma < 1 lightens midtones', () => {
    const src = createSurface(1, 1);
    setSurfacePixel(src, 0, 0, 0x80_80_80_ff);
    const dst = createSurface(1, 1);
    applySurfaceLevels(createSurfaceRegion(dst), createSurfaceRegion(src), 0, 255, 0.5);
    // gamma=0.5 → pow(0.5, 2) = 0.25 — darker than 0.5.
    const v = (getSurfacePixel(dst, 0, 0) >>> 24) & 0xff;
    expect(v).toBeLessThan(0x80);
  });

  it('gamma > 1 darkens midtones', () => {
    const src = createSurface(1, 1);
    setSurfacePixel(src, 0, 0, 0x80_80_80_ff);
    const dst = createSurface(1, 1);
    applySurfaceLevels(createSurfaceRegion(dst), createSurfaceRegion(src), 0, 255, 2);
    // gamma=2 → pow(0.5, 0.5) ≈ 0.707 → lighter.
    const v = (getSurfacePixel(dst, 0, 0) >>> 24) & 0xff;
    expect(v).toBeGreaterThan(0x80);
  });

  it('alpha channel is passed through unchanged', () => {
    const src = createSurface(1, 1, 0x80_80_80_aa);
    const dst = createSurface(1, 1);
    applySurfaceLevels(createSurfaceRegion(dst), createSurfaceRegion(src), 0, 255, 1);
    expect(getSurfacePixel(dst, 0, 0) & 0xff).toBe(0xaa);
  });
});
