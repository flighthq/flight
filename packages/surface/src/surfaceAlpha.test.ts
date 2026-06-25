import { createSurface } from './surface';
import { copySurfaceAlpha, multiplySurfaceAlpha, setSurfaceAlpha } from './surfaceAlpha';
import { getSurfacePixel, setSurfacePixel } from './surfacePixel';
import { createSurfaceRegion } from './surfaceRegion';

describe('copySurfaceAlpha', () => {
  it('copies alpha from source to dest, leaving RGB unchanged', () => {
    const src = createSurface(2, 1);
    setSurfacePixel(src, 0, 0, 0x00000080); // alpha 0x80
    setSurfacePixel(src, 1, 0, 0x000000ff); // alpha 0xff
    const dst = createSurface(2, 1, 0xff00ffff); // red pixels, fully opaque
    copySurfaceAlpha(createSurfaceRegion(dst), createSurfaceRegion(src));
    // RGB unchanged, alpha from source.
    expect((getSurfacePixel(dst, 0, 0) >>> 24) & 0xff).toBe(0xff); // red channel
    expect(getSurfacePixel(dst, 0, 0) & 0xff).toBe(0x80); // alpha
    expect(getSurfacePixel(dst, 1, 0) & 0xff).toBe(0xff);
  });

  it('same-surface region is a no-op on alpha', () => {
    const surf = createSurface(2, 1, 0x112233aa);
    copySurfaceAlpha(createSurfaceRegion(surf), createSurfaceRegion(surf));
    expect(getSurfacePixel(surf, 0, 0) & 0xff).toBe(0xaa);
  });

  it('operates only on the overlap of both regions', () => {
    const src = createSurface(3, 1, 0x00000080);
    const dst = createSurface(3, 1, 0x00000000);
    // Copy only 1 pixel wide.
    copySurfaceAlpha(
      { surface: dst, x: 0, y: 0, width: 1, height: 1 },
      { surface: src, x: 0, y: 0, width: 1, height: 1 },
    );
    expect(getSurfacePixel(dst, 0, 0) & 0xff).toBe(0x80);
    expect(getSurfacePixel(dst, 1, 0) & 0xff).toBe(0x00); // untouched
  });
});

describe('multiplySurfaceAlpha', () => {
  it('factor 0 makes region fully transparent', () => {
    const surf = createSurface(2, 2, 0xff0000ff);
    multiplySurfaceAlpha(createSurfaceRegion(surf), 0);
    expect(getSurfacePixel(surf, 0, 0) & 0xff).toBe(0);
    expect(getSurfacePixel(surf, 1, 1) & 0xff).toBe(0);
  });

  it('factor 1 leaves alpha unchanged', () => {
    const surf = createSurface(1, 1, 0xff0000ab);
    multiplySurfaceAlpha(createSurfaceRegion(surf), 1);
    expect(getSurfacePixel(surf, 0, 0) & 0xff).toBe(0xab);
  });

  it('factor 0.5 halves the alpha', () => {
    const surf = createSurface(1, 1, 0xff0000fe);
    multiplySurfaceAlpha(createSurfaceRegion(surf), 0.5);
    // 0xfe * 0.5 = 127
    expect(getSurfacePixel(surf, 0, 0) & 0xff).toBe(127);
  });

  it('clamps factor to [0, 1]', () => {
    const surf = createSurface(1, 1, 0xff0000aa);
    multiplySurfaceAlpha(createSurfaceRegion(surf), 2);
    // Factor clamped to 1, alpha unchanged.
    expect(getSurfacePixel(surf, 0, 0) & 0xff).toBe(0xaa);
  });

  it('leaves RGB channels unchanged', () => {
    const surf = createSurface(1, 1, 0x123456ff);
    multiplySurfaceAlpha(createSurfaceRegion(surf), 0.5);
    const p = getSurfacePixel(surf, 0, 0);
    expect((p >>> 24) & 0xff).toBe(0x12);
    expect((p >> 16) & 0xff).toBe(0x34);
    expect((p >> 8) & 0xff).toBe(0x56);
  });
});

describe('setSurfaceAlpha', () => {
  it('writes a constant alpha to all pixels in region', () => {
    const surf = createSurface(3, 3, 0xff0000ff);
    setSurfaceAlpha(createSurfaceRegion(surf), 0x40);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(getSurfacePixel(surf, x, y) & 0xff).toBe(0x40);
      }
    }
  });

  it('leaves RGB unchanged', () => {
    const surf = createSurface(1, 1, 0x112233ff);
    setSurfaceAlpha(createSurfaceRegion(surf), 0x80);
    const p = getSurfacePixel(surf, 0, 0);
    expect((p >>> 24) & 0xff).toBe(0x11);
    expect((p >> 16) & 0xff).toBe(0x22);
    expect((p >> 8) & 0xff).toBe(0x33);
    expect(p & 0xff).toBe(0x80);
  });

  it('clamps alpha to [0, 255]', () => {
    const surf = createSurface(1, 1, 0xff0000ff);
    setSurfaceAlpha(createSurfaceRegion(surf), -10);
    expect(getSurfacePixel(surf, 0, 0) & 0xff).toBe(0);
    setSurfaceAlpha(createSurfaceRegion(surf), 300);
    expect(getSurfacePixel(surf, 0, 0) & 0xff).toBe(255);
  });

  it('only affects the specified sub-region', () => {
    const surf = createSurface(4, 1, 0xff0000ff);
    setSurfaceAlpha({ surface: surf, x: 1, y: 0, width: 2, height: 1 }, 0x00);
    expect(getSurfacePixel(surf, 0, 0) & 0xff).toBe(0xff); // untouched
    expect(getSurfacePixel(surf, 1, 0) & 0xff).toBe(0x00);
    expect(getSurfacePixel(surf, 2, 0) & 0xff).toBe(0x00);
    expect(getSurfacePixel(surf, 3, 0) & 0xff).toBe(0xff); // untouched
  });
});
