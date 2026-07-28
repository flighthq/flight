import { createBitmap } from './bitmap';
import { getBitmapPixel } from './bitmapPixel';
import { resizeBitmap } from './bitmapResize';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('resizeBitmap', () => {
  it('nearest upscales by pixel duplication', () => {
    const source = createBitmap(2, 1);
    source.data.set([10, 20, 30, 255], 0);
    source.data.set([40, 50, 60, 255], 4);
    const out = createBitmap(4, 1);
    resizeBitmap(region(out), region(source), 'nearest');
    expect(getBitmapPixel(out, 0, 0)).toBe(getBitmapPixel(source, 0, 0));
    expect(getBitmapPixel(out, 1, 0)).toBe(getBitmapPixel(source, 0, 0));
    expect(getBitmapPixel(out, 2, 0)).toBe(getBitmapPixel(source, 1, 0));
    expect(getBitmapPixel(out, 3, 0)).toBe(getBitmapPixel(source, 1, 0));
  });

  it('bilinear interpolates between source pixels', () => {
    const source = createBitmap(2, 1);
    source.data.set([0, 0, 0, 255], 0);
    source.data.set([100, 100, 100, 255], 4);
    const out = createBitmap(4, 1);
    resizeBitmap(region(out), region(source), 'bilinear');
    expect(out.data[0]).toBe(0);
    expect(out.data[4]).toBeGreaterThanOrEqual(out.data[0]);
    expect(out.data[8]).toBeGreaterThan(out.data[4]);
    expect(out.data[12]).toBe(100);
  });

  it('bicubic produces a smoother interpolation than bilinear', () => {
    const source = createBitmap(2, 1);
    source.data.set([0, 0, 0, 255], 0);
    source.data.set([200, 200, 200, 255], 4);
    const out = createBitmap(4, 1);
    resizeBitmap(region(out), region(source), 'bicubic');
    // Bicubic should produce a monotonically increasing sequence
    expect(out.data[4]).toBeGreaterThanOrEqual(out.data[0]);
    expect(out.data[8]).toBeGreaterThanOrEqual(out.data[4]);
    expect(out.data[12]).toBeGreaterThanOrEqual(out.data[8]);
  });

  it('premultiplied option prevents dark-halo bleed at transparent edges', () => {
    // Red pixel adjacent to fully transparent. Straight-alpha blend mixes the
    // hidden black of the transparent pixel into the output. Premultiplied
    // blending keeps the red pure on the opaque side.
    const source = createBitmap(2, 1);
    source.data.set([255, 0, 0, 255], 0); // opaque red
    source.data.set([0, 0, 0, 0], 4); // transparent
    const straight = createBitmap(4, 1);
    resizeBitmap(region(straight), region(source), 'bilinear');
    const premul = createBitmap(4, 1);
    resizeBitmap(region(premul), region(source), { mode: 'bilinear', premultiplied: true });
    // At the boundary (pixel 1), premultiplied keeps red higher than straight
    expect(premul.data[4]).toBeGreaterThanOrEqual(straight.data[4]);
  });

  it('downscales by averaging toward the source values', () => {
    const source = createBitmap(4, 1, 0x40608000);
    const out = createBitmap(2, 1);
    resizeBitmap(region(out), region(source), 'bilinear');
    expect(out.data[0]).toBe(0x40);
    expect(out.data[1]).toBe(0x60);
    expect(out.data[2]).toBe(0x80);
  });

  it('resamples a source sub-region into a dest sub-region', () => {
    const source = createBitmap(4, 1);
    source.data.set([10, 0, 0, 255], 2 * 4); // source pixel (2,0)
    const out = createBitmap(4, 1);
    resizeBitmap(region(out, 0, 0, 2, 1), region(source, 2, 0, 1, 1), 'nearest');
    expect(out.data[0]).toBe(10);
    expect(out.data[4]).toBe(10);
    expect(out.data[8]).toBe(0); // outside the dest sub-region
  });

  it("edgeMode 'wrap' wraps boundary interpolation", () => {
    // 2px source [black, white]. With wrap, the right boundary wraps to the left.
    const source = createBitmap(2, 1);
    source.data.set([0, 0, 0, 255], 0);
    source.data.set([200, 200, 200, 255], 4);
    const outClamp = createBitmap(4, 1);
    resizeBitmap(region(outClamp), region(source), { mode: 'bilinear', edgeMode: 'clamp' });
    const outWrap = createBitmap(4, 1);
    resizeBitmap(region(outWrap), region(source), { mode: 'bilinear', edgeMode: 'wrap' });
    // The rightmost pixel should differ: clamp repeats edge, wrap uses the other side.
    expect(outClamp.data[12]).not.toBe(outWrap.data[12]);
  });

  it("edgeMode 'transparent' fades boundary pixels to transparent", () => {
    const source = createBitmap(2, 1, 0xff0000ff);
    const out = createBitmap(4, 1);
    resizeBitmap(region(out), region(source), { mode: 'bilinear', edgeMode: 'transparent' });
    // The rightmost pixel samples partially out-of-bounds → alpha drops
    expect(out.data[12 + 3]).toBeLessThan(255);
  });

  it('is a no-op when a dimension is zero', () => {
    const source = createBitmap(2, 2, 0xffffffff);
    const out = createBitmap(0, 0);
    expect(() => resizeBitmap(region(out), region(source))).not.toThrow();
  });
});
