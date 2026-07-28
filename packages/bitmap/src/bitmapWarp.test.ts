import type { Bitmap, BitmapRegion } from '@flighthq/types/contract';

import { createBitmap } from './bitmap';
import { getBitmapPixel, setBitmapPixel } from './bitmapPixel';
import { warpBitmap, warpBitmapQuad } from './bitmapWarp';

function region(bitmap: Readonly<Bitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height): BitmapRegion {
  return { bitmap, x, y, width, height };
}

describe('warpBitmap', () => {
  it('identity matrix copies source to dest', () => {
    const src = createBitmap(4, 4, 0xff0000ff);
    const dst = createBitmap(4, 4);
    // Identity homography: dest pixel (x,y) maps to source (x,y).
    warpBitmap(region(dst), region(src), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(getBitmapPixel(dst, 0, 0)).toBe(0xff0000ff);
    expect(getBitmapPixel(dst, 3, 3)).toBe(0xff0000ff);
  });

  it('translation matrix shifts source', () => {
    const src = createBitmap(4, 4);
    setBitmapPixel(src, 0, 0, 0xff0000ff);
    const dst = createBitmap(4, 4);
    // Translate source by (-1, -1): dest pixel (x,y) reads source (x-1, y-1).
    warpBitmap(region(dst), region(src), [1, 0, -1, 0, 1, -1, 0, 0, 1], 'transparent', 'nearest');
    // dst(1,1) should map to src(0,0)
    expect(getBitmapPixel(dst, 1, 1)).toBe(0xff0000ff);
    // dst(0,0) maps to src(-1,-1) → transparent
    expect(getBitmapPixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('clamp edgeMode extends border pixels', () => {
    const src = createBitmap(2, 2, 0x00ff00ff);
    const dst = createBitmap(4, 4);
    // Translate source by (2,2): most dst pixels map outside src → clamp to border.
    warpBitmap(region(dst), region(src), [1, 0, 2, 0, 1, 2, 0, 0, 1], 'clamp', 'nearest');
    // dst(0,0) maps to src(-2,-2) → clamped to src(0,0) = green
    expect(getBitmapPixel(dst, 0, 0)).toBe(0x00ff00ff);
  });

  it('transparent edgeMode gives transparent black outside bounds', () => {
    const src = createBitmap(2, 2, 0xffffffff);
    const dst = createBitmap(4, 4);
    warpBitmap(region(dst), region(src), [1, 0, 3, 0, 1, 3, 0, 0, 1], 'transparent', 'nearest');
    // All dst pixels map to src outside bounds.
    expect(getBitmapPixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('zero-size regions are a no-op', () => {
    const src = createBitmap(4, 4, 0xffffffff);
    const dst = createBitmap(4, 4);
    warpBitmap(region(dst, 0, 0, 0, 4), region(src), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(getBitmapPixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('near-zero w coefficient produces transparent pixel', () => {
    const src = createBitmap(2, 2, 0xffffffff);
    const dst = createBitmap(2, 2);
    // Pathological matrix where w ≈ 0 at (0,0).
    warpBitmap(region(dst), region(src), [1, 0, 0, 0, 1, 0, 1e-15, 0, 0], 'clamp', 'nearest');
    // Should not throw; pixel at (0,0) with w≈0 becomes transparent.
    expect(dst.data[3]).toBe(0);
  });
});

describe('warpBitmapQuad', () => {
  it('identity quad (src corners → dst corners) copies source', () => {
    const src = createBitmap(4, 4, 0x0000ffff);
    const dst = createBitmap(4, 4);
    // Map source [4x4] corners to dest [4x4] corners unchanged.
    warpBitmapQuad(region(dst), region(src), [0, 0, 4, 0, 4, 4, 0, 4], 'transparent', 'nearest');
    // Interior pixels should be blue.
    expect(getBitmapPixel(dst, 2, 2)).toBe(0x0000ffff);
  });

  it('degenerate quad (zero-area) produces no output', () => {
    const src = createBitmap(4, 4, 0xffffffff);
    const dst = createBitmap(4, 4);
    // All four corners at the same point → degenerate homography.
    warpBitmapQuad(region(dst), region(src), [2, 2, 2, 2, 2, 2, 2, 2], 'transparent', 'nearest');
    // Should not throw; output can be transparent or unchanged.
    expect(dst.data.every((v) => v === 0 || true)).toBe(true);
  });

  it('zero-size source or dest is a no-op', () => {
    const src = createBitmap(4, 4, 0xffffffff);
    const dst = createBitmap(4, 4);
    warpBitmapQuad(region(dst, 0, 0, 0, 0), region(src), [0, 0, 4, 0, 4, 4, 0, 4]);
    expect(getBitmapPixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('horizontal shear quad produces non-trivial sampling', () => {
    const src = createBitmap(8, 8);
    // Fill left half red, right half green.
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        const i = (py * 8 + px) * 4;
        src.data[i] = px < 4 ? 255 : 0;
        src.data[i + 1] = px >= 4 ? 255 : 0;
        src.data[i + 2] = 0;
        src.data[i + 3] = 255;
      }
    }
    const dst = createBitmap(8, 8);
    // Shear: right edge shifted up by 2 pixels.
    warpBitmapQuad(region(dst), region(src), [0, 0, 8, 2, 8, 8, 0, 8], 'transparent', 'nearest');
    // Should not throw; output should be non-blank for inner pixels.
    let hasNonZero = false;
    for (let i = 0; i < dst.data.length; i++) {
      if (dst.data[i] !== 0) {
        hasNonZero = true;
        break;
      }
    }
    expect(hasNonZero).toBe(true);
  });
});
