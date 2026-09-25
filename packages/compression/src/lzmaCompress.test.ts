import { CompressionFraming } from '@flighthq/types/contract';

import { decompressLzma } from './lzma';
import { compressLzma, sdkHostCompressLzma } from './lzmaCompress';

describe('compressLzma', () => {
  it('round-trips empty input', () => {
    const input = new Uint8Array(0);
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, 0, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
  });

  it('round-trips a short literal string', () => {
    const input = new TextEncoder().encode('Hello');
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
  });

  it('round-trips repetitive data', () => {
    const input = new Uint8Array(5400);
    for (let i = 0; i < input.length; i++) input[i] = i % 27;
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
    expect(compressed.length).toBeLessThan(input.length);
  });

  it('round-trips prose text', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. ' +
      'Pack my box with five dozen liquor jugs. ' +
      'How vexingly quick daft zebras jump. ' +
      'The five boxing wizards jump quickly. ';
    const input = new TextEncoder().encode(text.repeat(5));
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
    expect(compressed.length).toBeLessThan(input.length);
  });

  it('round-trips all byte values', () => {
    const input = new Uint8Array(256);
    for (let i = 0; i < 256; i++) input[i] = i;
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
  });

  it('round-trips a large repetitive block', () => {
    const input = new Uint8Array(65536);
    for (let i = 0; i < input.length; i++) input[i] = i % 100;
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
    expect(compressed.length).toBeLessThan(input.length / 2);
  });

  it('round-trips single-byte input', () => {
    const input = new Uint8Array([42]);
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
  });

  it('round-trips two-byte input', () => {
    const input = new Uint8Array([0xab, 0xcd]);
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
  });

  it('round-trips data with long repeated runs', () => {
    const input = new Uint8Array(1000).fill(0x55);
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
    expect(compressed.length).toBeLessThan(100);
  });

  it('writes a valid LZMA alone header', () => {
    const input = new TextEncoder().encode('header check');
    const compressed = compressLzma(input);
    expect(compressed.length).toBeGreaterThanOrEqual(13);
    const propByte = compressed[0];
    expect(propByte).toBeLessThanOrEqual(224);
    const size = compressed[5] | (compressed[6] << 8) | (compressed[7] << 16) | ((compressed[8] << 24) >>> 0);
    expect(size).toBe(input.length);
  });

  it('produces compressed output smaller than input for compressible data', () => {
    const input = new Uint8Array(4096);
    for (let i = 0; i < input.length; i++) input[i] = i % 10;
    const compressed = compressLzma(input);
    expect(compressed.length).toBeLessThan(input.length);
  });

  it('decompresses with uncompressedLength=0 (size from header)', () => {
    const input = new TextEncoder().encode('header size only');
    const compressed = compressLzma(input);
    const decompressed = decompressLzma(compressed, 0, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
  });
});

describe('sdkHostCompressLzma', () => {
  it('compresses with Raw framing', () => {
    const input = new TextEncoder().encode('capability test');
    const compressed = sdkHostCompressLzma.compress(input, CompressionFraming.Raw);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
  });

  it('rejects non-Raw framing', () => {
    const input = new Uint8Array([1, 2, 3]);
    expect(() => sdkHostCompressLzma.compress(input, CompressionFraming.Rfc1950)).toThrow(
      'lzma: only Raw framing is supported',
    );
  });
});
