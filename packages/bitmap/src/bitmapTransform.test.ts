import { createBitmap } from './bitmap';
import { getBitmapPixel, setBitmapPixel } from './bitmapPixel';
import { applyBitmapColorScaleBias, applyBitmapThreshold, mergeBitmap, scrollBitmap } from './bitmapTransform';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

const identity = {
  redScale: 1,
  greenScale: 1,
  blueScale: 1,
  alphaScale: 1,
  redBias: 0,
  greenBias: 0,
  blueBias: 0,
  alphaBias: 0,
};

describe('applyBitmapColorScaleBias', () => {
  it('applies scale', () => {
    const img = createBitmap(2, 2, 0x808080ff);
    applyBitmapColorScaleBias(region(img), region(img), { ...identity, redScale: 0 });
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(0x80);
  });

  it('applies normalized-linear bias', () => {
    const img = createBitmap(1, 1);
    setBitmapPixel(img, 0, 0, 0x000000ff);
    applyBitmapColorScaleBias(region(img), region(img), { ...identity, redBias: 100 / 255 });
    expect(img.data[0]).toBe(100);
  });

  it('clamps to 0-255', () => {
    const img = createBitmap(1, 1, 0x808080ff);
    applyBitmapColorScaleBias(region(img), region(img), { ...identity, redScale: 10, redBias: 100 / 255 });
    expect(img.data[0]).toBe(255);
    applyBitmapColorScaleBias(region(img), region(img), { ...identity, redScale: 0, redBias: -100 / 255 });
    expect(img.data[0]).toBe(0);
  });

  it('only affects the specified rect', () => {
    const img = createBitmap(2, 2, 0x808080ff);
    applyBitmapColorScaleBias(region(img, 0, 0, 1, 1), region(img, 0, 0, 1, 1), { ...identity, redScale: 0 });
    expect(img.data[0]).toBe(0);
    expect(img.data[4]).toBe(0x80);
  });

  it('can write to a separate output bitmap', () => {
    const source = createBitmap(1, 1, 0x808080ff);
    const out = createBitmap(1, 1);
    applyBitmapColorScaleBias(region(out), region(source), { ...identity, redScale: 0 });
    expect(out.data[0]).toBe(0);
    expect(out.data[1]).toBe(0x80);
    expect(source.data[0]).toBe(0x80); // source unchanged
  });
});

describe('applyBitmapThreshold', () => {
  it('replaces pixels that pass the test', () => {
    const src = createBitmap(2, 1);
    setBitmapPixel(src, 0, 0, 0x808080ff);
    setBitmapPixel(src, 1, 0, 0x404040ff);
    const dst = createBitmap(2, 1);
    const count = applyBitmapThreshold(region(dst), region(src), '>', 0x607060ff, 0xffffffff);
    expect(count).toBe(1);
    expect(getBitmapPixel(dst, 0, 0)).toBe(0xffffffff);
    expect(getBitmapPixel(dst, 1, 0)).toBe(0x00000000);
  });

  it('copies source when copySource is true and test fails', () => {
    const src = createBitmap(1, 1, 0x112233ff);
    const dst = createBitmap(1, 1);
    applyBitmapThreshold(region(dst), region(src), '>', 0xffffffff, 0xffffffff, 0xffffffff, true);
    expect(getBitmapPixel(dst, 0, 0)).toBe(0x112233ff);
  });

  it('returns zero when no pixels pass', () => {
    const src = createBitmap(2, 2, 0x000000ff);
    const dst = createBitmap(2, 2);
    const count = applyBitmapThreshold(region(dst), region(src), '>', 0xffffffff);
    expect(count).toBe(0);
  });
});

describe('mergeBitmap', () => {
  it('with multiplier 1 copies source', () => {
    const src = createBitmap(1, 1, 0xff0000ff);
    const dst = createBitmap(1, 1, 0x0000ffff);
    mergeBitmap(region(dst), region(src), 1, 1, 1, 1);
    expect(dst.data[0]).toBe(0xff);
    expect(dst.data[2]).toBe(0x00);
  });

  it('with multiplier 0 keeps destination', () => {
    const src = createBitmap(1, 1, 0xff0000ff);
    const dst = createBitmap(1, 1, 0x0000ffff);
    mergeBitmap(region(dst), region(src), 0, 0, 0, 0);
    expect(dst.data[0]).toBe(0x00);
    expect(dst.data[2]).toBe(0xff);
  });

  it('with multiplier 0.5 blends evenly', () => {
    const src = createBitmap(1, 1, 0x200000ff);
    const dst = createBitmap(1, 1, 0x000020ff);
    mergeBitmap(region(dst), region(src), 0.5, 0, 0.5, 0);
    expect(dst.data[0]).toBeCloseTo(16, 0);
    expect(dst.data[2]).toBeCloseTo(16, 0);
  });
});

describe('scrollBitmap', () => {
  it('shifts content right with wrapping', () => {
    const img = createBitmap(4, 1);
    setBitmapPixel(img, 0, 0, 0xff0000ff);
    scrollBitmap(img, 1, 0);
    expect(getBitmapPixel(img, 1, 0)).toBe(0xff0000ff);
    expect(getBitmapPixel(img, 0, 0)).toBe(0x00000000);
  });

  it('wraps pixels around the edge', () => {
    const img = createBitmap(4, 1);
    setBitmapPixel(img, 3, 0, 0xaabbccff);
    scrollBitmap(img, 1, 0);
    expect(getBitmapPixel(img, 0, 0)).toBe(0xaabbccff);
  });
});
