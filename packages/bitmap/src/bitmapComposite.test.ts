import { BitmapCompositeMode } from '@flighthq/types/contract';

import { createBitmap } from './bitmap';
import {
  compositeBitmapPixels,
  compositeBitmapRegion,
  extractBitmapPixels,
  extractBitmapPixels32,
  writeBitmapPixels,
  writeBitmapPixels32,
} from './bitmapComposite';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('compositeBitmapPixels', () => {
  it('alpha-composites pixels over the destination', () => {
    const dest = createBitmap(1, 1, 0x0000ffff);
    const pixels = new Uint8ClampedArray([0xff, 0, 0, 0xff]);
    compositeBitmapPixels(region(dest), pixels);
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(0xff);
  });

  it('blends semi-transparent source over destination', () => {
    const dest = createBitmap(1, 1, 0x000000ff);
    const pixels = new Uint8ClampedArray([0xff, 0xff, 0xff, 0x80]);
    compositeBitmapPixels(region(dest), pixels);
    expect(dest.data[0]).toBeGreaterThan(0);
    expect(dest.data[0]).toBeLessThan(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('silently skips pixels outside destination bounds', () => {
    const dest = createBitmap(1, 1);
    const pixels = new Uint8ClampedArray([0xff, 0xff, 0xff, 0xff]);
    compositeBitmapPixels(region(dest, 5, 5, 1, 1), pixels);
    expect(dest.data[3]).toBe(0);
  });

  it('multiply blend mode multiplies source and destination channels', () => {
    const dest = createBitmap(1, 1, 0xff0000ff); // RGBA: opaque red
    const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
    compositeBitmapPixels(region(dest), pixels, BitmapCompositeMode.Multiply);
    expect(dest.data[0]).toBe(128); // 255 * 128 / 255
    expect(dest.data[1]).toBe(0); // 0 * 128 / 255
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(255);
  });

  it('add blend mode clamps the sum of channels', () => {
    const dest = createBitmap(1, 1, 0x640000ff); // RGBA: opaque dark red (R=100)
    const pixels = new Uint8ClampedArray([200, 0, 0, 255]);
    compositeBitmapPixels(region(dest), pixels, BitmapCompositeMode.Add);
    expect(dest.data[0]).toBe(255); // min(255, 100 + 200)
  });

  it('defaults to source-over (Normal) when no blend mode is given', () => {
    const dest = createBitmap(1, 1, 0xff0000ff); // RGBA: opaque red
    const pixels = new Uint8ClampedArray([0, 0, 255, 255]);
    compositeBitmapPixels(region(dest), pixels);
    expect(dest.data[0]).toBe(0);
    expect(dest.data[2]).toBe(255);
  });

  it('overlay blend mode darkens on dark backdrops', () => {
    const dest = createBitmap(1, 1, 0x400000ff); // RGBA: R=64
    const pixels = new Uint8ClampedArray([200, 0, 0, 255]);
    compositeBitmapPixels(region(dest), pixels, BitmapCompositeMode.Overlay);
    expect(dest.data[0]).toBe(100); // 2 * 64 * 200 / 255
  });

  it('hardlight blend mode is overlay with operands swapped', () => {
    const dest = createBitmap(1, 1, 0xc80000ff); // RGBA: R=200
    const pixels = new Uint8ClampedArray([64, 0, 0, 255]);
    compositeBitmapPixels(region(dest), pixels, BitmapCompositeMode.HardLight);
    expect(dest.data[0]).toBe(100); // 2 * 200 * 64 / 255
  });

  it('invert blend mode inverts the backdrop, ignoring source color', () => {
    const dest = createBitmap(1, 1, 0xc80000ff); // RGBA: R=200
    const pixels = new Uint8ClampedArray([0, 0, 0, 255]);
    compositeBitmapPixels(region(dest), pixels, BitmapCompositeMode.Invert);
    expect(dest.data[0]).toBe(55); // 255 - 200
  });

  it('DestinationOut (erase) knocks alpha out of the backdrop, keeping color', () => {
    const dest = createBitmap(1, 1, 0xff0000ff); // RGBA: opaque red
    const pixels = new Uint8ClampedArray([0, 0, 0, 128]);
    compositeBitmapPixels(region(dest), pixels, BitmapCompositeMode.DestinationOut);
    expect(dest.data[0]).toBe(255); // color untouched
    expect(dest.data[3]).toBe(127); // 255 * (1 - 128/255)
  });

  it('DestinationIn (alpha) masks the backdrop to the source coverage', () => {
    const dest = createBitmap(1, 1, 0xff0000ff); // RGBA: opaque red
    const pixels = new Uint8ClampedArray([0, 0, 0, 128]);
    compositeBitmapPixels(region(dest), pixels, BitmapCompositeMode.DestinationIn);
    expect(dest.data[0]).toBe(255); // backdrop color kept
    expect(dest.data[3]).toBe(128); // 255 * (128/255)
  });

  it('Copy overwrites the backdrop with the source', () => {
    const dest = createBitmap(1, 1, 0xff0000ff); // opaque red
    const pixels = new Uint8ClampedArray([0, 0, 255, 128]); // semi-transparent blue
    compositeBitmapPixels(region(dest), pixels, BitmapCompositeMode.Copy);
    expect(dest.data[2]).toBe(255);
    expect(dest.data[3]).toBe(128); // source alpha replaces, no source-over
  });
});

describe('compositeBitmapRegion', () => {
  it('alpha-composites a region of one bitmap over another', () => {
    const source = createBitmap(1, 1, 0xff0000ff);
    const dest = createBitmap(1, 1, 0x0000ffff);
    compositeBitmapRegion(region(dest), region(source));
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[2]).toBe(0);
  });

  it('clips to the smaller of source and dest dimensions', () => {
    const source = createBitmap(1, 1, 0xff0000ff);
    const dest = createBitmap(3, 3);
    compositeBitmapRegion(region(dest, 1, 1, 2, 2), region(source));
    expect(dest.data[(1 * 3 + 1) * 4]).toBe(0xff);
    expect(dest.data[(1 * 3 + 2) * 4]).toBe(0);
  });

  it('applies the blend mode to the source region', () => {
    const source = createBitmap(1, 1, 0x808080ff); // RGBA: opaque gray
    const dest = createBitmap(1, 1, 0xff0000ff); // RGBA: opaque red
    compositeBitmapRegion(region(dest), region(source), BitmapCompositeMode.Multiply);
    expect(dest.data[0]).toBe(128); // 255 * 128 / 255
    expect(dest.data[1]).toBe(0);
  });
});

describe('extractBitmapPixels', () => {
  it('copies a bitmap region into a tightly-packed buffer', () => {
    const source = createBitmap(2, 2);
    const i = (1 * 2 + 1) * 4;
    source.data[i] = 0xff;
    source.data[i + 3] = 0xff;
    const out = new Uint8ClampedArray(4);
    extractBitmapPixels(out, region(source, 1, 1, 1, 1));
    expect(out[0]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('silently skips pixels outside source bounds', () => {
    const source = createBitmap(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4 * 4);
    extractBitmapPixels(out, region(source, -1, -1, 2, 2));
    const i = (1 * 2 + 1) * 4;
    expect(out[i]).toBe(0xff);
    expect(out[i + 3]).toBe(0xff);
    expect(out[0]).toBe(0);
  });

  it('source.bitmap.data can be passed as out for a full-bitmap extraction', () => {
    const source = createBitmap(2, 2, 0xaabbccff);
    extractBitmapPixels(source.data, region(source));
    expect(source.data[0]).toBe(0xaa);
    expect(source.data[3]).toBe(0xff);
  });
});

describe('extractBitmapPixels32', () => {
  it('packs each pixel into one 0xRRGGBBAA entry', () => {
    const source = createBitmap(2, 2);
    const i = (1 * 2 + 1) * 4;
    source.data[i] = 0x11;
    source.data[i + 1] = 0x22;
    source.data[i + 2] = 0x33;
    source.data[i + 3] = 0x44;
    const out = new Uint32Array(1);
    extractBitmapPixels32(out, region(source, 1, 1, 1, 1));
    expect(out[0]).toBe(0x11223344);
  });

  it('round-trips with writeBitmapPixels32', () => {
    const source = createBitmap(3, 2);
    for (let p = 0; p < 6; p++) {
      const i = p * 4;
      source.data[i] = p * 10 + 1;
      source.data[i + 1] = p * 10 + 2;
      source.data[i + 2] = p * 10 + 3;
      source.data[i + 3] = p * 10 + 4;
    }
    const packed = new Uint32Array(6);
    extractBitmapPixels32(packed, region(source));
    const dest = createBitmap(3, 2);
    writeBitmapPixels32(region(dest), packed);
    expect(Array.from(dest.data)).toEqual(Array.from(source.data));
  });

  it('silently skips pixels outside source bounds', () => {
    const source = createBitmap(1, 1, 0xffffffff);
    const out = new Uint32Array(4);
    extractBitmapPixels32(out, region(source, -1, -1, 2, 2));
    expect(out[1 * 2 + 1]).toBe(0xffffffff);
    expect(out[0]).toBe(0);
  });
});

describe('writeBitmapPixels', () => {
  it('writes pixels at the given destination region', () => {
    const dest = createBitmap(3, 3);
    const pixels = new Uint8ClampedArray([0x33, 0x66, 0x99, 0xff]);
    writeBitmapPixels(region(dest, 1, 1, 1, 1), pixels);
    const i = (1 * 3 + 1) * 4;
    expect(dest.data[i]).toBe(0x33);
    expect(dest.data[i + 1]).toBe(0x66);
    expect(dest.data[i + 2]).toBe(0x99);
    expect(dest.data[i + 3]).toBe(0xff);
  });

  it('overwrites existing content', () => {
    const dest = createBitmap(1, 1, 0x0000ffff);
    const pixels = new Uint8ClampedArray([0xff, 0, 0, 0xff]);
    writeBitmapPixels(region(dest), pixels);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[0]).toBe(0xff);
  });

  it('silently clips writes outside destination bounds', () => {
    const dest = createBitmap(1, 1);
    const pixels = new Uint8ClampedArray([0xff, 0xff, 0xff, 0xff]);
    writeBitmapPixels(region(dest, 5, 5, 1, 1), pixels);
    expect(dest.data[3]).toBe(0);
  });
});

describe('writeBitmapPixels32', () => {
  it('unpacks each 0xRRGGBBAA entry into the destination region', () => {
    const dest = createBitmap(3, 3);
    writeBitmapPixels32(region(dest, 1, 1, 1, 1), new Uint32Array([0x33669900 | 0xff]));
    const i = (1 * 3 + 1) * 4;
    expect(dest.data[i]).toBe(0x33);
    expect(dest.data[i + 1]).toBe(0x66);
    expect(dest.data[i + 2]).toBe(0x99);
    expect(dest.data[i + 3]).toBe(0xff);
  });

  it('overwrites existing content', () => {
    const dest = createBitmap(1, 1, 0x0000ffff);
    writeBitmapPixels32(region(dest), new Uint32Array([0xff0000ff]));
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[2]).toBe(0);
  });

  it('silently clips writes outside destination bounds', () => {
    const dest = createBitmap(1, 1);
    writeBitmapPixels32(region(dest, 5, 5, 1, 1), new Uint32Array([0xffffffff]));
    expect(dest.data[3]).toBe(0);
  });
});
