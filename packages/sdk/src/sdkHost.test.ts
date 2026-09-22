import { sdkHostCompressDeflate, sdkHostDecompressDeflate } from '@flighthq/compression';
import { CompressionFraming } from '@flighthq/types/contract';

import { sdkHost, sdkHostCompress, sdkHostDecompress } from './sdkHost';

describe('sdkHost', () => {
  it('exposes compress.deflate as the portable encoder slot', () => {
    expect(sdkHost.compress.deflate).toBe(sdkHostCompressDeflate);
  });

  it('exposes decompress.deflate as the portable decoder slot', () => {
    expect(sdkHost.decompress.deflate).toBe(sdkHostDecompressDeflate);
  });

  it('round-trips bytes through the aggregate compress and decompress slots', () => {
    const bytes = new TextEncoder().encode('aggregate round trip');
    const compressed = sdkHost.compress.deflate.compress(bytes, CompressionFraming.Raw);
    expect(sdkHost.decompress.deflate.decompress(compressed, bytes.length, CompressionFraming.Raw)).toEqual(bytes);
  });
});

describe('sdkHostCompress', () => {
  it('carries only the deflate slot', () => {
    expect(Object.keys(sdkHostCompress)).toEqual(['deflate']);
    expect(sdkHostCompress.deflate).toBe(sdkHostCompressDeflate);
  });
});

describe('sdkHostDecompress', () => {
  it('carries only the deflate slot', () => {
    expect(Object.keys(sdkHostDecompress)).toEqual(['deflate']);
    expect(sdkHostDecompress.deflate).toBe(sdkHostDecompressDeflate);
  });
});
