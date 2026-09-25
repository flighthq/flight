import { CompressionFraming } from '@flighthq/types/contract';

import { decompressLzma, sdkHostDecompressLzma } from './lzma';

// The compressed fixtures below are precomputed with Python 3's `lzma` module in LZMA alone format
// (13-byte header: 1 byte properties + 4 bytes dictionary size + 8 bytes uncompressed size LE, followed
// by the range-coded stream). Headers carry the declared uncompressed size unless noted; the EOS_TERMINATED
// fixture carries 0xFFFFFFFFFFFFFFFF (unknown) and relies on the end-of-stream marker instead. Generated
// once with Python 3.12, `lzma.compress(data, format=lzma.FORMAT_ALONE)`, default properties lc=3/lp=0/pb=2
// unless noted otherwise. Round-trip assertions verify the decoder reproduces the original bytes exactly.
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore. ';
const FIXTURES = {
  EMPTY: 'XQAAgAAAAAAAAAAAAACD//v//8AAAAA=',
  LITERAL: 'XQAAgAAWAAAAAAAAAAAzGwlhGvxuQ0djOEOOegx+SF/9GpGR4mriTv//OtQAAA==',
  REPETITIVE: 'XQAAgAAYFQAAAAAAAAAwmIiVWA1cL8CWPd4EwdfDUzb4YxrC89ZwXRCrpoeyUdvTx5o45hzWZ//+5qgA',
  LOREM:
    'XQAAgAC8BAAAAAAAAAAmG8pGZ1ryd7h9hthB2wU1zYOlfBKlBduQvS8U03FylqiKfYRWcY1qIpirnj3DVe/MpcPdW46/A4EhQNYmkQJFT5KheLuKAK+QKiaSAiPlXLMt4+hcLPsyIhobwQyDdnLg9O1dkZ1vqP+nSEAA',
  HIGH_RATIO:
    'XQAAgAAAAAEAAAAAAAAAAFJQCoT5shSEwNQfjcv62XEVMXFIzslqZUB7WJdNx+nyYL98NdWkQKtgY2m70luPToPtjk2J35Y9+g1XU+rioRtXt20WiAZxVK393ZkH6XV7zoP//30wAAA=',
  BINARY:
    'XQAAgAAABAAAAAAAAAAAAFJQCoT5m7KAIalp1ifgPgZaXwSNU9QEujlXBQnBVSTenbhxWTFgoZ/5b0lz8sjqjLoaiylpIYD+M4Nmr0Zt7J6JiguD8DwOiY4/7V/nnpDZHP8y9LLgOVGy0hQVtMVxutsG43man7s4wbAArJMLqgYZAxIIFVubyEjwMi7+LaCHyPCk4NJR641nVpKyTYTF8YYx32piW8J5Ldn3PHO6dHQH2DypViIkoWb4WoRfMGfS9ktJLn8g69v4EA6UeHfHP2vvtM2V4m/2RG4GzwuCGsvbevBXjZj/kMA+5sESQXXuAyiW6xP7pyjMryzes4P///iKnQA=',
  // lc=0, lp=2, pb=0 — properties byte 18 (0*45 + 2*9 + 0)
  NON_DEFAULT_PROPS:
    'EgAAgACEAwAAAAAAAAAqGtnUdETvKUbQpX7kuGSBCVmJ/pkOyXrALgn2sW0227s2SUzMgfoYYCWHaBoAHVQGrWUzhTDeGD//2rVAAA==',
  // Header carries 0xFFFFFFFFFFFFFFFF (unknown size), terminated by end-of-stream marker.
  EOS_TERMINATED: 'XQAAgAD//////////wAzGwlhGvxuQ0djOEOOegx+SF/9GpGR4mriTv//OtQAAA==',
} as const;

function decodeBase64(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(128);
  for (let i = 0; i < alphabet.length; i++) lookup[alphabet.charCodeAt(i)] = i;
  const clean = input.replace(/=+$/, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let accumulator = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    accumulator = (accumulator << 6) | lookup[clean.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (accumulator >> bits) & 0xff;
    }
  }
  return out;
}

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('decompressLzma', () => {
  it('round-trips empty input', () => {
    expect(decompressLzma(decodeBase64(FIXTURES.EMPTY), 0, CompressionFraming.Raw)).toEqual(new Uint8Array(0));
  });

  it('round-trips a short literal run', () => {
    expect(decompressLzma(decodeBase64(FIXTURES.LITERAL), 0, CompressionFraming.Raw)).toEqual(
      encode('flighthq scene-formats'),
    );
  });

  it('round-trips highly repetitive data through LZ back-references and grows the output buffer', () => {
    expect(decompressLzma(decodeBase64(FIXTURES.REPETITIVE), 0, CompressionFraming.Raw)).toEqual(
      encode('abcABC123'.repeat(600)),
    );
  });

  it('round-trips prose through genuine LZ matches', () => {
    expect(decompressLzma(decodeBase64(FIXTURES.LOREM), 0, CompressionFraming.Raw)).toEqual(encode(LOREM.repeat(12)));
  });

  it('keeps decompressing a stream whose expansion ratio is large but bounded', () => {
    const source = new Uint8Array(64 * 1024);
    for (let i = 0; i < source.length; i++) source[i] = i % 7;
    expect(decompressLzma(decodeBase64(FIXTURES.HIGH_RATIO), 0, CompressionFraming.Raw)).toEqual(source);
  });

  it('round-trips binary data covering all byte values', () => {
    const source = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) source[i] = i % 256;
    expect(decompressLzma(decodeBase64(FIXTURES.BINARY), 0, CompressionFraming.Raw)).toEqual(source);
  });

  it('round-trips with non-default LZMA properties (lc=0, lp=2, pb=0)', () => {
    expect(decompressLzma(decodeBase64(FIXTURES.NON_DEFAULT_PROPS), 0, CompressionFraming.Raw)).toEqual(
      encode('The quick brown fox jumps over the lazy dog. '.repeat(20)),
    );
  });

  it('decompresses an EOS-terminated stream when the header declares unknown size', () => {
    expect(decompressLzma(decodeBase64(FIXTURES.EOS_TERMINATED), 0, CompressionFraming.Raw)).toEqual(
      encode('flighthq scene-formats'),
    );
  });

  it('stops expansion at the container-declared output bound', () => {
    const compressed = decodeBase64(FIXTURES.LITERAL);
    const text = encode('flighthq scene-formats');
    expect(decompressLzma(compressed, text.length, CompressionFraming.Raw)).toEqual(text);
    expect(decompressLzma(compressed, text.length - 1, CompressionFraming.Raw)).toBeNull();
  });

  it('uses the caller uncompressedLength even when the header declares unknown size', () => {
    const compressed = decodeBase64(FIXTURES.EOS_TERMINATED);
    const text = encode('flighthq scene-formats');
    expect(decompressLzma(compressed, text.length, CompressionFraming.Raw)).toEqual(text);
  });

  it('returns null on a truncated stream rather than throwing', () => {
    expect(decompressLzma(decodeBase64(FIXTURES.LITERAL).subarray(0, 15), 0, CompressionFraming.Raw)).toBeNull();
  });

  it('returns null on a corrupt stream', () => {
    const corrupted = decodeBase64(FIXTURES.LITERAL).slice();
    corrupted[20] ^= 0xff;
    expect(decompressLzma(corrupted, 0, CompressionFraming.Raw)).toBeNull();
  });

  it('returns null when the header is too short', () => {
    expect(decompressLzma(new Uint8Array(12), 0, CompressionFraming.Raw)).toBeNull();
  });

  it('returns null for an invalid properties byte', () => {
    const bad = decodeBase64(FIXTURES.LITERAL).slice();
    bad[0] = 225;
    expect(decompressLzma(bad, 0, CompressionFraming.Raw)).toBeNull();
  });

  it('returns null for unsupported framing values', () => {
    expect(decompressLzma(decodeBase64(FIXTURES.LITERAL), 0, CompressionFraming.Rfc1950)).toBeNull();
    expect(decompressLzma(decodeBase64(FIXTURES.LITERAL), 0, 'Unknown' as never)).toBeNull();
  });

  it('returns null when the range coder start byte is not zero', () => {
    const bad = decodeBase64(FIXTURES.LITERAL).slice();
    bad[13] = 0x01;
    expect(decompressLzma(bad, 0, CompressionFraming.Raw)).toBeNull();
  });
});

describe('sdkHostDecompressLzma', () => {
  it('is a ready-made LZMA slot carrying the portable decoder', () => {
    expect(sdkHostDecompressLzma.decompress).toBe(decompressLzma);
  });

  it('decompresses through the slot exactly as the bare function does', () => {
    expect(sdkHostDecompressLzma.decompress(decodeBase64(FIXTURES.LITERAL), 0, CompressionFraming.Raw)).toEqual(
      encode('flighthq scene-formats'),
    );
  });
});
