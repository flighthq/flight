import {
  registerDecompressor,
  registerDeflateDecompressor,
  unregisterDecompressor,
} from '@flighthq/compression/contract';
import { createEmbeddedImageResourceReference } from '@flighthq/image/contract';
import type { DecodedImage, SwfJpegAlphaPayload } from '@flighthq/types/contract';
import { BitmapTextureSourceKind, Compression, CompressionFraming } from '@flighthq/types/contract';

import { createSwfJpegAlphaBitmap, createSwfLosslessBitmap } from './swfBitmap';

describe('createSwfJpegAlphaBitmap', () => {
  beforeEach(() => registerDeflateDecompressor());
  afterEach(() => unregisterDecompressor(Compression.Deflate));

  it('replaces the decoded alpha plane with real deflate output while preserving straight RGB', () => {
    const decoded: DecodedImage = {
      data: new Uint8ClampedArray([0x11, 0x12, 0x13, 0xaa, 0x21, 0x22, 0x23, 0xbb, 0x31, 0x32, 0x33, 0xcc]),
      height: 1,
      width: 3,
    };
    const alpha = [0, 0x80, 0xff];
    const bitmap = createSwfJpegAlphaBitmap(decoded, jpegAlphaPayload(3, 1, alpha));
    const expected = [0x11, 0x12, 0x13, 0, 0x21, 0x22, 0x23, 0x80, 0x31, 0x32, 0x33, 0xff];

    expect(bitmap).toMatchObject({
      alphaType: 'straight',
      format: 'rgba8unorm',
      gamut: 'srgb',
      height: 1,
      kind: BitmapTextureSourceKind,
      width: 3,
    });
    expect([...bitmap!.data]).toEqual(expected);
    // Mutation check: the oracle must distinguish a one-pixel shift of the authored alpha plane.
    const shifted = new Uint8ClampedArray(bitmap!.data);
    for (let pixel = 0; pixel < alpha.length; pixel++) shifted[pixel * 4 + 3] = alpha[(pixel + 1) % alpha.length];
    expect([...shifted]).not.toEqual(expected);
  });

  it('rejects decoded dimensions that differ from the retained SWF dimensions', () => {
    const payload = jpegAlphaPayload(2, 1, [0, 0xff]);

    expect(createSwfJpegAlphaBitmap(decodedImage(1, 1), payload)).toBeNull();
    expect(createSwfJpegAlphaBitmap(decodedImage(2, 2), payload)).toBeNull();
  });

  it('rejects short and long decompressed alpha planes', () => {
    const decoded = decodedImage(2, 1);

    expect(createSwfJpegAlphaBitmap(decoded, jpegAlphaPayload(2, 1, [0]))).toBeNull();
    expect(createSwfJpegAlphaBitmap(decoded, jpegAlphaPayload(2, 1, [0, 0x80, 0xff]))).toBeNull();
  });

  it('reports nothing when no deflate decompressor is registered', () => {
    unregisterDecompressor(Compression.Deflate);

    expect(createSwfJpegAlphaBitmap(decodedImage(1, 1), jpegAlphaPayload(1, 1, [0xff]))).toBeNull();
  });
});

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

  it('bounds lossless expansion to the exact row layout and requests zlib framing', () => {
    unregisterDecompressor(Compression.Deflate);
    registerDecompressor(Compression.Deflate, (_compressed, uncompressedLength, framing) => {
      expect(uncompressedLength).toBe(12); // 3 pixels × 4 bytes, with no implicit unbounded growth.
      expect(framing).toBe(CompressionFraming.Rfc1950);
      return new Uint8Array(uncompressedLength);
    });

    expect(createSwfLosslessBitmap(payload(5, 3, 1, [0]), false)).not.toBeNull();
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

function decodedImage(width: number, height: number): DecodedImage {
  return { data: new Uint8ClampedArray(width * height * 4), height, width };
}

function jpegAlphaPayload(width: number, height: number, alpha: readonly number[]): SwfJpegAlphaPayload {
  return {
    characterId: 1,
    compressedAlphaBytes: new Uint8Array(stored(alpha)),
    deblockingParameterRaw: null,
    height,
    reference: createEmbeddedImageResourceReference(new Uint8Array([0xff, 0xd8]), 'image/jpeg'),
    width,
  };
}

// A stored (uncompressed) DEFLATE block wrapped in a zlib header, so the test exercises the real
// decompressor rather than a stub.
function stored(bytes: readonly number[]): number[] {
  const length = bytes.length;
  let first = 1;
  let second = 0;
  for (const byte of bytes) {
    first = (first + byte) % 65_521;
    second = (second + first) % 65_521;
  }
  const adler = ((second << 16) | first) >>> 0;
  return [
    0x78,
    0x01,
    0x01,
    length & 0xff,
    length >> 8,
    ~length & 0xff,
    (~length >> 8) & 0xff,
    ...bytes,
    adler >>> 24,
    (adler >>> 16) & 0xff,
    (adler >>> 8) & 0xff,
    adler & 0xff,
  ];
}
