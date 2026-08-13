import { registerDeflateDecompressor, unregisterDecompressor } from '@flighthq/compression/contract';
import {
  clearImageDecoders,
  decodeImage,
  decodeImagePremultiplied,
  hasImageDecoder,
} from '@flighthq/image-codec/contract';
import { Compression } from '@flighthq/types/contract';

import { registerSwfImageDecoders, SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE } from './swfImageDecoder';

beforeEach(() => {
  clearImageDecoders();
  unregisterDecompressor(Compression.Deflate);
});

afterEach(() => {
  clearImageDecoders();
  unregisterDecompressor(Compression.Deflate);
});

describe('registerSwfImageDecoders', () => {
  it('explicitly registers both container-native lossless MIME types', () => {
    expect(hasImageDecoder(SWF_LOSSLESS_MIME_TYPE)).toBe(false);
    expect(hasImageDecoder(SWF_LOSSLESS_ALPHA_MIME_TYPE)).toBe(false);

    registerSwfImageDecoders();

    expect(hasImageDecoder(SWF_LOSSLESS_MIME_TYPE)).toBe(true);
    expect(hasImageDecoder(SWF_LOSSLESS_ALPHA_MIME_TYPE)).toBe(true);
  });

  it('retains authored premultiplied pixels when requested and normalizes the default to straight', async () => {
    registerDeflateDecompressor();
    registerSwfImageDecoders();
    const payload = losslessPayload(5, 1, 1, stored([0x80, 0x40, 0x20, 0x10]));

    const premultiplied = await decodeImagePremultiplied(payload, SWF_LOSSLESS_ALPHA_MIME_TYPE);
    const straight = await decodeImage(payload, SWF_LOSSLESS_ALPHA_MIME_TYPE);

    expect([...premultiplied!.data]).toEqual([0x40, 0x20, 0x10, 0x80]);
    expect([...straight!.data]).toEqual([0x80, 0x40, 0x20, 0x80]);
  });
});

function losslessPayload(format: number, width: number, height: number, pixels: readonly number[]): Uint8Array {
  return new Uint8Array([format, width & 0xff, width >> 8, height & 0xff, height >> 8, ...pixels]);
}

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
