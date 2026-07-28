import { createBitmap } from './bitmap';
import { compositeBitmapPixels, compositeBitmapRegion } from './bitmapComposite';
import { dropShadowBitmap, glowBitmap, innerGlowBitmap, innerShadowBitmap } from './bitmapShadow';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('dropShadowBitmap', () => {
  it('produces a tinted alpha mask in out', () => {
    const source = createBitmap(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    dropShadowBitmap(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x0000ffff });
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('compositing out at an offset places the shadow correctly', () => {
    const source = createBitmap(1, 1, 0xffffffff);
    const dest = createBitmap(4, 4);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    dropShadowBitmap(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x0000ffff });
    const angle = (0 * Math.PI) / 180;
    const offsetX = Math.round(Math.cos(angle) * 1);
    const offsetY = Math.round(Math.sin(angle) * 1);
    compositeBitmapPixels(region(dest, 1 + offsetX, 1 + offsetY, 1, 1), out);
    const i = (1 * dest.width + 2) * 4;
    expect(dest.data[i + 2]).toBe(0xff);
    expect(dest.data[i + 3]).toBe(0xff);
  });

  it('compositing shadow then source produces source-over-shadow', () => {
    const source = createBitmap(1, 1, 0xff0000ff);
    const dest = createBitmap(2, 1);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    dropShadowBitmap(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x0000ffff });
    compositeBitmapPixels(region(dest, 1, 0, 1, 1), out);
    compositeBitmapRegion(region(dest, 0, 0, 1, 1), region(source));
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('source.bitmap.data can be used as out for a full-bitmap region', () => {
    const bitmap = createBitmap(1, 1, 0xffffffff);
    const scratch = new Uint8ClampedArray(4);
    dropShadowBitmap(bitmap.data, scratch, region(bitmap), { radiusX: 0, radiusY: 0, color: 0x0000ffff });
    expect(bitmap.data[2]).toBe(0xff); // tinted blue
    expect(bitmap.data[3]).toBe(0xff); // alpha carried from source
  });
});

describe('glowBitmap', () => {
  it('produces a tinted alpha mask in out', () => {
    const source = createBitmap(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    glowBitmap(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x00ff00ff });
    expect(out[1]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('compositing out places the glow at the same position', () => {
    const source = createBitmap(1, 1, 0xffffffff);
    const dest = createBitmap(1, 1);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    glowBitmap(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x00ff00ff });
    compositeBitmapPixels(region(dest), out);
    expect(dest.data[1]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('compositing source over glow produces source-over-glow', () => {
    const source = createBitmap(1, 1, 0xff0000ff);
    const dest = createBitmap(1, 1);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    glowBitmap(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x00ff00ff });
    compositeBitmapPixels(region(dest), out);
    compositeBitmapRegion(region(dest), region(source));
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('source.bitmap.data can be used as out for a full-bitmap region', () => {
    const bitmap = createBitmap(1, 1, 0xffffffff);
    const scratch = new Uint8ClampedArray(4);
    glowBitmap(bitmap.data, scratch, region(bitmap), { radiusX: 0, radiusY: 0, color: 0x00ff00ff });
    expect(bitmap.data[1]).toBe(0xff);
    expect(bitmap.data[3]).toBe(0xff);
  });
});

describe('innerGlowBitmap', () => {
  it('clips the glow to inside the shape and tints it', () => {
    // 3x1: transparent | opaque | transparent. The inner glow appears only on
    // the opaque pixel; transparent pixels (outside the shape) stay at 0 alpha.
    const source = createBitmap(3, 1);
    source.data[1 * 4 + 3] = 255;
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    innerGlowBitmap(out, scratch, region(source), { radiusX: 2, radiusY: 0, color: 0x00ff00ff });
    expect(out[0 * 4 + 3]).toBe(0);
    expect(out[2 * 4 + 3]).toBe(0);
    expect(out[1 * 4 + 3]).toBe(170);
    expect(out[1 * 4 + 0]).toBe(0);
    expect(out[1 * 4 + 1]).toBe(0xff);
    expect(out[1 * 4 + 2]).toBe(0);
  });

  it('produces no inner glow when blur is zero', () => {
    const source = createBitmap(1, 1, 0x0000ffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    innerGlowBitmap(out, scratch, region(source), { radiusX: 0, radiusY: 0 });
    expect(out[3]).toBe(0);
  });
});

describe('innerShadowBitmap', () => {
  it('defaults to a black tint', () => {
    const source = createBitmap(3, 1);
    source.data[1 * 4 + 3] = 255;
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    innerShadowBitmap(out, scratch, region(source), { radiusX: 2, radiusY: 0 });
    expect(out[1 * 4 + 0]).toBe(0);
    expect(out[1 * 4 + 1]).toBe(0);
    expect(out[1 * 4 + 2]).toBe(0);
    expect(out[1 * 4 + 3]).toBe(170);
  });

  it('gathers the shadow toward one edge when given a directional offset', () => {
    // A 3-px-wide filled bar (px 1..3) inside a 5-px row; px 0 and 4 are exterior.
    const source = createBitmap(5, 1);
    for (let px = 1; px <= 3; px++) source.data[px * 4 + 3] = 255;
    const alphaAt = (offsetX: number): number[] => {
      const out = new Uint8ClampedArray(5 * 4);
      const scratch = new Uint8ClampedArray(5 * 4);
      innerShadowBitmap(out, scratch, region(source), { offsetX, radiusX: 1, radiusY: 0 });
      return [out[1 * 4 + 3], out[2 * 4 + 3], out[3 * 4 + 3]];
    };
    // Zero offset rings the boundary evenly: the two interior edges match.
    const centered = alphaAt(0);
    expect(centered[0]).toBe(centered[2]);
    // A positive offset pulls the exterior in from the left, so the shadow gathers on the left edge.
    const shifted = alphaAt(2);
    expect(shifted[0]).toBeGreaterThan(shifted[2]);
    // The opposite offset mirrors it.
    const mirrored = alphaAt(-2);
    expect(mirrored[2]).toBeGreaterThan(mirrored[0]);
    expect(mirrored[0]).toBe(shifted[2]);
    expect(mirrored[2]).toBe(shifted[0]);
  });
});
