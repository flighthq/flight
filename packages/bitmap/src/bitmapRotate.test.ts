import { createBitmap } from './bitmap';
import { getBitmapPixel } from './bitmapPixel';
import { rotateBitmap, rotateBitmap180, rotateBitmapClockwise, rotateBitmapCounterClockwise } from './bitmapRotate';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

// 2x1 bitmap: pixel (0,0) = A, pixel (1,0) = B.
function ab() {
  const bitmap = createBitmap(2, 1);
  bitmap.data.set([0xa0, 0, 0, 255], 0);
  bitmap.data.set([0xb0, 0, 0, 255], 4);
  return bitmap;
}

describe('rotateBitmap', () => {
  it('with angle 0 copies source into dest', () => {
    const source = createBitmap(3, 3, 0xff0000ff);
    const out = createBitmap(3, 3);
    rotateBitmap(region(out), region(source), 0);
    expect(out.data[0]).toBe(0xff);
    expect(out.data[3]).toBe(0xff);
  });

  it('with angle π reverses source similar to rotateBitmap180', () => {
    const source = ab();
    const out = createBitmap(2, 1);
    rotateBitmap(region(out), region(source), Math.PI);
    // Bilinear introduces slight blending, so just check direction
    expect(out.data[0]).toBeGreaterThan(out.data[4]); // B-side (brighter) on left
  });

  it('clamp edge mode (default) repeats edge pixels for out-of-bounds', () => {
    const source = createBitmap(1, 1, 0xff0000ff);
    const out = createBitmap(5, 5);
    rotateBitmap(region(out), region(source), 0);
    // With clamp, all pixels map to the single source pixel
    expect(out.data[(0 * 5 + 0) * 4 + 3]).toBe(0xff);
    expect(out.data[(2 * 5 + 2) * 4 + 3]).toBe(0xff);
  });

  it('transparent edge mode writes transparent black for out-of-bounds', () => {
    const source = createBitmap(1, 1, 0xff0000ff);
    const out = createBitmap(5, 5);
    rotateBitmap(region(out), region(source), 0, undefined, undefined, 'transparent');
    // Only center pixel maps back to source; corners are out of bounds
    expect(out.data[(0 * 5 + 0) * 4 + 3]).toBe(0);
    expect(out.data[(2 * 5 + 2) * 4 + 3]).toBe(0xff);
  });

  it('wrap edge mode tiles the source', () => {
    const source = createBitmap(2, 2, 0xff0000ff);
    const out = createBitmap(4, 4);
    rotateBitmap(region(out), region(source), 0, undefined, undefined, 'wrap');
    // All pixels should be opaque red (wraps the 2x2 source)
    expect(out.data[3]).toBe(0xff);
    expect(out.data[(3 * 4 + 3) * 4 + 3]).toBe(0xff);
  });

  it('nearest sample mode uses nearest-neighbor interpolation', () => {
    const source = createBitmap(2, 1);
    source.data.set([0, 0, 0, 255], 0);
    source.data.set([200, 200, 200, 255], 4);
    const out = createBitmap(2, 1);
    rotateBitmap(region(out), region(source), 0, undefined, undefined, 'clamp', 'nearest');
    // Nearest should produce exact pixel values, no blending
    expect(out.data[0]).toBe(0);
    expect(out.data[4]).toBe(200);
  });
});

describe('rotateBitmap180', () => {
  it('reverses pixel order with matching dimensions', () => {
    const source = ab();
    const out = createBitmap(2, 1);
    rotateBitmap180(region(out), region(source));
    expect(out.data[0]).toBe(0xb0);
    expect(out.data[4]).toBe(0xa0);
  });

  it('rotates in place when dest and source are the same region', () => {
    const bitmap = ab();
    rotateBitmap180(region(bitmap), region(bitmap));
    expect(bitmap.data[0]).toBe(0xb0);
    expect(bitmap.data[4]).toBe(0xa0);
  });
});

describe('rotateBitmapClockwise', () => {
  it('rotates a row into a column, left element on top', () => {
    const source = ab();
    const out = createBitmap(1, 2);
    rotateBitmapClockwise(region(out), region(source));
    expect(getBitmapPixel(out, 0, 0)).toBe(getBitmapPixel(source, 0, 0));
    expect(getBitmapPixel(out, 0, 1)).toBe(getBitmapPixel(source, 1, 0));
  });
});

describe('rotateBitmapCounterClockwise', () => {
  it('rotates a row into a column, right element on top', () => {
    const source = ab();
    const out = createBitmap(1, 2);
    rotateBitmapCounterClockwise(region(out), region(source));
    expect(getBitmapPixel(out, 0, 0)).toBe(getBitmapPixel(source, 1, 0));
    expect(getBitmapPixel(out, 0, 1)).toBe(getBitmapPixel(source, 0, 0));
  });
});
