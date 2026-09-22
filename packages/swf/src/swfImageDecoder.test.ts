import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';

import { decodeSwfImage, SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE } from './swfImageDecoder';

describe('decodeSwfImage', () => {
  it('decodes both container-native lossless MIME types', async () => {
    const payload = losslessPayload(5, 1, 1, stored([0x80, 0x40, 0x20, 0x10]));

    const lossless = await decodeSwfImage(payload, SWF_LOSSLESS_MIME_TYPE, sdkHostDecompressDeflate);
    const alpha = await decodeSwfImage(payload, SWF_LOSSLESS_ALPHA_MIME_TYPE, sdkHostDecompressDeflate);

    expect(lossless).not.toBeNull();
    expect(alpha).not.toBeNull();
  });

  it('returns null for unrecognized MIME types', async () => {
    const payload = losslessPayload(5, 1, 1, stored([0x80, 0x40, 0x20, 0x10]));

    expect(await decodeSwfImage(payload, 'image/png', sdkHostDecompressDeflate)).toBeNull();
  });

  it('retains authored premultiplied pixels when requested and normalizes the default to straight', async () => {
    const payload = losslessPayload(5, 1, 1, stored([0x80, 0x40, 0x20, 0x10]));

    const premultiplied = await decodeSwfImage(payload, SWF_LOSSLESS_ALPHA_MIME_TYPE, sdkHostDecompressDeflate, {
      premultiplyAlpha: true,
    });
    const straight = await decodeSwfImage(payload, SWF_LOSSLESS_ALPHA_MIME_TYPE, sdkHostDecompressDeflate);

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
