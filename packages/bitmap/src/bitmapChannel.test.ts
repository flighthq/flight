import { createBitmap } from './bitmap';
import { initializeBitmap, mergeBitmapChannels, splitBitmapChannels } from './bitmapChannel';
import { getBitmapPixel, setBitmapPixel } from './bitmapPixel';
import { createBitmapRegion } from './bitmapRegion';

describe('initializeBitmap', () => {
  it('is the construction initializer of createBitmap', () => {
    expect(typeof initializeBitmap).toBe('function');
  });
});

describe('mergeBitmapChannels', () => {
  it('combines one channel from each input into the output', () => {
    const rSurf = createBitmap(1, 1, 0xff000000); // R=0xff, G=0, B=0, A=0
    const gSurf = createBitmap(1, 1, 0x00ff0000); // R=0, G=0xff, B=0, A=0
    const bSurf = createBitmap(1, 1, 0x0000ff00); // R=0, G=0, B=0xff, A=0
    const aSurf = createBitmap(1, 1, 0x000000ff); // R=0, G=0, B=0, A=0xff
    const out = createBitmap(1, 1);
    mergeBitmapChannels(
      createBitmapRegion(out),
      createBitmapRegion(rSurf),
      createBitmapRegion(gSurf),
      createBitmapRegion(bSurf),
      createBitmapRegion(aSurf),
    );
    expect(getBitmapPixel(out, 0, 0)).toBe(0xff_ff_ff_ff);
  });

  it('uses the minimum dimension overlap', () => {
    const r = createBitmap(3, 1, 0xff000000);
    const g = createBitmap(3, 1, 0x00ff0000);
    const b = createBitmap(3, 1, 0x0000ff00);
    const a = createBitmap(3, 1, 0x000000ff);
    const out = createBitmap(3, 1);
    // Restrict r region to width=1 — only pixel 0 should be written.
    mergeBitmapChannels(
      createBitmapRegion(out),
      { bitmap: r, x: 0, y: 0, width: 1, height: 1 },
      createBitmapRegion(g),
      createBitmapRegion(b),
      createBitmapRegion(a),
    );
    // Pixel 0 is covered; pixel 1 should be untouched (0x00000000).
    expect((getBitmapPixel(out, 0, 0) >>> 24) & 0xff).toBe(0xff);
    expect(getBitmapPixel(out, 1, 0)).toBe(0x00000000);
  });
});
describe('splitBitmapChannels', () => {
  it('returns four bitmaps of the same dimensions', () => {
    const src = createBitmap(3, 2, 0x112233ff);
    const [r, g, b, a] = splitBitmapChannels(src);
    expect(r.width).toBe(3);
    expect(r.height).toBe(2);
    expect(g.width).toBe(3);
    expect(b.height).toBe(2);
    expect(a.width).toBe(3);
  });

  it('each channel bitmap is a grayscale copy of that channel', () => {
    const src = createBitmap(1, 1);
    setBitmapPixel(src, 0, 0, 0x11_22_33_44);
    const [r, g, b, a] = splitBitmapChannels(src);
    // R bitmap: R=G=B=0x11, A=0xff.
    expect((getBitmapPixel(r, 0, 0) >>> 24) & 0xff).toBe(0x11);
    expect((getBitmapPixel(r, 0, 0) >> 16) & 0xff).toBe(0x11);
    expect((getBitmapPixel(r, 0, 0) >> 8) & 0xff).toBe(0x11);
    expect(getBitmapPixel(r, 0, 0) & 0xff).toBe(0xff);
    // G bitmap: R=G=B=0x22, A=0xff.
    expect((getBitmapPixel(g, 0, 0) >>> 24) & 0xff).toBe(0x22);
    // B bitmap: R=G=B=0x33, A=0xff.
    expect((getBitmapPixel(b, 0, 0) >>> 24) & 0xff).toBe(0x33);
    // A bitmap: R=G=B=A=0x44 (alpha stored in all channels for round-trip fidelity).
    expect((getBitmapPixel(a, 0, 0) >>> 24) & 0xff).toBe(0x44);
    expect(getBitmapPixel(a, 0, 0) & 0xff).toBe(0x44);
  });

  it('returns distinct bitmap objects', () => {
    const src = createBitmap(2, 2, 0xffffffff);
    const [r, g, b, a] = splitBitmapChannels(src);
    expect(r).not.toBe(src);
    expect(r).not.toBe(g);
    expect(g).not.toBe(b);
    expect(b).not.toBe(a);
  });

  it('round-trip: split then merge reconstructs the original', () => {
    const src = createBitmap(2, 2);
    setBitmapPixel(src, 0, 0, 0xaabbccdd);
    setBitmapPixel(src, 1, 0, 0x11223344);
    const [r, g, b, a] = splitBitmapChannels(src);
    const out = createBitmap(2, 2);
    mergeBitmapChannels(
      createBitmapRegion(out),
      createBitmapRegion(r),
      createBitmapRegion(g),
      createBitmapRegion(b),
      createBitmapRegion(a),
    );
    expect(getBitmapPixel(out, 0, 0)).toBe(0xaabbccdd);
    expect(getBitmapPixel(out, 1, 0)).toBe(0x11223344);
  });
});
