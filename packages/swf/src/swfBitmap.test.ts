import { registerDeflateDecompressor } from '@flighthq/compression/contract';
import { unregisterDecompressor } from '@flighthq/compression/contract';
import { Compression } from '@flighthq/types/contract';

import { createSwfLosslessBitmap } from './swfBitmap';

describe('createSwfLosslessBitmap', () => {
  beforeEach(() => registerDeflateDecompressor());
  afterEach(() => unregisterDecompressor(Compression.Deflate));

  it('unpacks a 24-bit image, discarding the padding byte each pixel carries', () => {
    // Two opaque pixels, each stored as pad/red/green/blue.
    const bitmap = createSwfLosslessBitmap(payload(5, 2, 1, stored([0, 0x11, 0x22, 0x33, 0, 0x44, 0x55, 0x66])), false);

    expect(bitmap?.width).toBe(2);
    expect([...bitmap!.data]).toEqual([0x11, 0x22, 0x33, 0xff, 0x44, 0x55, 0x66, 0xff]);
    expect(bitmap?.alphaType).toBe('opaque');
  });

  it('reads the alpha form as premultiplied, which is how the format stores it', () => {
    const bitmap = createSwfLosslessBitmap(payload(5, 1, 1, stored([0x80, 0x40, 0x20, 0x10])), true);

    // Alpha leads the pixel, and the colour channels already have it folded in — so they are handed over
    // untouched with the type that says so, rather than being divided back out here.
    expect([...bitmap!.data]).toEqual([0x40, 0x20, 0x10, 0x80]);
    expect(bitmap?.alphaType).toBe('premultiplied');
  });

  it('resolves colour-mapped pixels through the table that precedes them', () => {
    // A two-entry RGB table, then one padded row of indices selecting the second entry then the first.
    const body = [0x01, 0x02, 0x03, 0xfe, 0xfd, 0xfc, 1, 0, 0, 0];
    const bitmap = createSwfLosslessBitmap(payloadWithTable(3, 2, 1, 2, stored(body)), false);

    expect([...bitmap!.data.slice(0, 8)]).toEqual([0xfe, 0xfd, 0xfc, 0xff, 0x01, 0x02, 0x03, 0xff]);
  });

  it('scales fifteen-bit channels up rather than leaving them dark', () => {
    // All five bits set in every channel must reach full white, not 0xf8.
    const bitmap = createSwfLosslessBitmap(payload(4, 1, 1, stored([0x7f, 0xff, 0, 0])), false);

    expect([...bitmap!.data]).toEqual([0xff, 0xff, 0xff, 0xff]);
  });

  it('reports nothing when no decompressor is registered, rather than failing', () => {
    unregisterDecompressor(Compression.Deflate);

    expect(createSwfLosslessBitmap(payload(5, 1, 1, stored([0, 1, 2, 3])), false)).toBeNull();
  });

  it('reports nothing for a payload whose pixels run short', () => {
    expect(createSwfLosslessBitmap(payload(5, 64, 64, stored([0, 1, 2, 3])), false)).toBeNull();
    expect(createSwfLosslessBitmap(new Uint8Array([5, 1]), false)).toBeNull();
  });
});

function payload(format: number, width: number, height: number, pixels: readonly number[]): Uint8Array {
  return new Uint8Array([format, width & 0xff, width >> 8, height & 0xff, height >> 8, ...pixels]);
}

function payloadWithTable(
  format: number,
  width: number,
  height: number,
  colorCount: number,
  pixels: readonly number[],
): Uint8Array {
  return new Uint8Array([format, width & 0xff, width >> 8, height & 0xff, height >> 8, colorCount - 1, ...pixels]);
}

// A stored (uncompressed) DEFLATE block wrapped in a zlib header, so the test exercises the real
// decompressor rather than a stub.
function stored(bytes: readonly number[]): number[] {
  const length = bytes.length;
  return [0x78, 0x01, 0x01, length & 0xff, length >> 8, ~length & 0xff, (~length >> 8) & 0xff, ...bytes, 0, 0, 0, 0];
}
