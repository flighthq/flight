import {
  sdkHostCompressDeflate,
  sdkHostCompressLzma,
  sdkHostDecompressDeflate,
  sdkHostDecompressLzma,
} from '@flighthq/compression';
import { CompressionFraming } from '@flighthq/types/contract';

import { sdkHost, sdkHostCompress, sdkHostDecompress } from './sdkHost.ts';

describe('sdkHost', () => {
  it('exposes compress.deflate as the portable encoder slot', () => {
    expect(sdkHost.compress.deflate).toBe(sdkHostCompressDeflate);
  });

  it('exposes decompress.deflate as the portable decoder slot', () => {
    expect(sdkHost.decompress.deflate).toBe(sdkHostDecompressDeflate);
  });

  it('exposes compress.lzma as the portable encoder slot', () => {
    expect(sdkHost.compress.lzma).toBe(sdkHostCompressLzma);
  });

  it('exposes decompress.lzma as the portable decoder slot', () => {
    expect(sdkHost.decompress.lzma).toBe(sdkHostDecompressLzma);
  });

  it('round-trips bytes through the aggregate compress and decompress slots', () => {
    const bytes = new TextEncoder().encode('aggregate round trip');
    const compressed = sdkHost.compress.deflate.compress(bytes, CompressionFraming.Raw);
    expect(sdkHost.decompress.deflate.decompress(compressed, bytes.length, CompressionFraming.Raw)).toEqual(bytes);
  });
});

describe('sdkHostCompress', () => {
  it('carries the deflate and lzma slots', () => {
    expect(Object.keys(sdkHostCompress)).toEqual(['deflate', 'lzma']);
    expect(sdkHostCompress.deflate).toBe(sdkHostCompressDeflate);
    expect(sdkHostCompress.lzma).toBe(sdkHostCompressLzma);
  });
});

describe('sdkHostDecompress', () => {
  it('carries the deflate and lzma slots', () => {
    expect(Object.keys(sdkHostDecompress)).toEqual(['deflate', 'lzma']);
    expect(sdkHostDecompress.deflate).toBe(sdkHostDecompressDeflate);
    expect(sdkHostDecompress.lzma).toBe(sdkHostDecompressLzma);
  });
});
