import { createBitmap } from './bitmap';
import { flipBitmapHorizontal, flipBitmapVertical } from './bitmapFlip';
import { getBitmapPixel } from './bitmapPixel';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

function ramp(width: number, height: number) {
  const bitmap = createBitmap(width, height);
  for (let i = 0; i < width * height; i++) {
    bitmap.data[i * 4] = i;
    bitmap.data[i * 4 + 3] = 255;
  }
  return bitmap;
}

describe('flipBitmapHorizontal', () => {
  it('mirrors columns left-to-right into a separate dest', () => {
    const source = ramp(3, 1);
    const out = createBitmap(3, 1);
    flipBitmapHorizontal(region(out), region(source));
    expect(out.data[0]).toBe(2);
    expect(out.data[4]).toBe(1);
    expect(out.data[8]).toBe(0);
  });

  it('mirrors in place when dest and source are the same region', () => {
    const bitmap = ramp(4, 1);
    flipBitmapHorizontal(region(bitmap), region(bitmap));
    expect(bitmap.data[0]).toBe(3);
    expect(bitmap.data[4]).toBe(2);
    expect(bitmap.data[8]).toBe(1);
    expect(bitmap.data[12]).toBe(0);
  });
});

describe('flipBitmapVertical', () => {
  it('mirrors rows top-to-bottom into a separate dest', () => {
    const source = ramp(1, 3);
    const out = createBitmap(1, 3);
    flipBitmapVertical(region(out), region(source));
    expect(getBitmapPixel(out, 0, 0)).toBe(getBitmapPixel(source, 0, 2));
    expect(getBitmapPixel(out, 0, 2)).toBe(getBitmapPixel(source, 0, 0));
  });

  it('mirrors in place when dest and source are the same region', () => {
    const bitmap = ramp(1, 4);
    flipBitmapVertical(region(bitmap), region(bitmap));
    expect(bitmap.data[0]).toBe(3);
    expect(bitmap.data[12]).toBe(0);
  });
});
