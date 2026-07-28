import { createBitmap } from './bitmap';
import { fillBitmapRectangle, floodFillBitmap } from './bitmapFill';
import { getBitmapPixel } from './bitmapPixel';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('fillBitmapRectangle', () => {
  it('fills the specified region', () => {
    const img = createBitmap(4, 4);
    fillBitmapRectangle(region(img, 1, 1, 2, 2), 0xaabbccff);
    expect(getBitmapPixel(img, 1, 1)).toBe(0xaabbccff);
    expect(getBitmapPixel(img, 2, 2)).toBe(0xaabbccff);
  });

  it('bumps the bitmap version (self-invalidation)', () => {
    const img = createBitmap(4, 4);
    const before = img.version;
    fillBitmapRectangle(region(img, 1, 1, 2, 2), 0xaabbccff);
    expect(img.version).toBe(before + 1);
  });

  it('does not affect pixels outside the region', () => {
    const img = createBitmap(4, 4);
    fillBitmapRectangle(region(img, 1, 1, 2, 2), 0xaabbccff);
    expect(getBitmapPixel(img, 0, 0)).toBe(0x00000000);
    expect(getBitmapPixel(img, 3, 3)).toBe(0x00000000);
  });

  it('skips pixels outside the bitmap bounds', () => {
    const img = createBitmap(2, 2, 0x000000ff);
    fillBitmapRectangle(region(img, -1, -1, 4, 4), 0xffffffff);
    expect(getBitmapPixel(img, 0, 0)).toBe(0xffffffff);
    expect(getBitmapPixel(img, 1, 1)).toBe(0xffffffff);
  });
});

describe('floodFillBitmap', () => {
  it('fills a connected region', () => {
    const img = createBitmap(3, 3, 0xffffffff);
    floodFillBitmap(img, 0, 0, 0x000000ff);
    for (let py = 0; py < 3; py++) {
      for (let px = 0; px < 3; px++) {
        expect(getBitmapPixel(img, px, py)).toBe(0x000000ff);
      }
    }
  });

  it('does not cross a barrier', () => {
    const img = createBitmap(3, 3, 0xffffffff);
    for (let py = 0; py < 3; py++) {
      const i = (py * 3 + 1) * 4;
      img.data[i] = 0;
      img.data[i + 1] = 0;
      img.data[i + 2] = 0;
      img.data[i + 3] = 0xff;
    }
    floodFillBitmap(img, 0, 0, 0x0000ffff);
    expect(getBitmapPixel(img, 0, 0)).toBe(0x0000ffff);
    expect(getBitmapPixel(img, 2, 0)).toBe(0xffffffff);
  });

  it('is a no-op when fill color matches target', () => {
    const img = createBitmap(2, 2, 0x112233ff);
    floodFillBitmap(img, 0, 0, 0x112233ff);
    expect(getBitmapPixel(img, 0, 0)).toBe(0x112233ff);
  });

  it('reuses the scratch buffer across calls', () => {
    const img = createBitmap(4, 4, 0xffffffff);
    floodFillBitmap(img, 0, 0, 0x000000ff);
    floodFillBitmap(img, 0, 0, 0xffffffff); // second call reuses buffer
    expect(getBitmapPixel(img, 0, 0)).toBe(0xffffffff);
  });

  it('reuses the scratch buffer across calls', () => {
    const img = createBitmap(4, 4, 0xffffffff);
    floodFillBitmap(img, 0, 0, 0x000000ff);
    floodFillBitmap(img, 0, 0, 0xffffffff); // second call reuses buffer
    expect(getBitmapPixel(img, 0, 0)).toBe(0xffffffff);
  });
});
