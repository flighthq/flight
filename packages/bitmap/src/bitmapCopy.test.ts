import { createBitmap } from './bitmap';
import { copyBitmapChannel, copyBitmapPixels } from './bitmapCopy';
import { ImageChannel } from './bitmapImageChannel';
import { getBitmapPixel, setBitmapPixel } from './bitmapPixel';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('copyBitmapChannel', () => {
  it('copies the red channel to the blue channel', () => {
    const src = createBitmap(2, 2);
    src.data[0] = 0xab;
    const dst = createBitmap(2, 2);
    copyBitmapChannel(region(dst), ImageChannel.Blue, region(src), ImageChannel.Red);
    expect(dst.data[2]).toBe(src.data[0]);
  });

  it('copies the alpha channel independently', () => {
    const src = createBitmap(1, 1);
    setBitmapPixel(src, 0, 0, 0x000000de);
    const dst = createBitmap(1, 1);
    copyBitmapChannel(region(dst), ImageChannel.Alpha, region(src), ImageChannel.Alpha);
    expect(dst.data[3]).toBe(0xde);
  });
});

describe('copyBitmapPixels', () => {
  it('copies a region without alpha blend', () => {
    const src = createBitmap(2, 2, 0xaabbccff);
    const dst = createBitmap(4, 4);
    copyBitmapPixels(region(dst, 1, 1, 2, 2), region(src, 0, 0, 2, 2));
    expect(getBitmapPixel(dst, 1, 1)).toBe(0xaabbccff);
    expect(getBitmapPixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('alpha-composites when composite is true', () => {
    const src = createBitmap(1, 1);
    setBitmapPixel(src, 0, 0, 0xff000080);
    const dst = createBitmap(1, 1);
    setBitmapPixel(dst, 0, 0, 0x0000ffff);
    copyBitmapPixels(region(dst), region(src), true);
    const result = getBitmapPixel(dst, 0, 0);
    expect(result & 0xff).toBe(0xff); // alpha opaque after composite
    expect((result >>> 24) & 0xff).toBeGreaterThan(0); // red blended in
    expect((result >> 8) & 0xff).toBeGreaterThan(0); // blue retained
  });
});
