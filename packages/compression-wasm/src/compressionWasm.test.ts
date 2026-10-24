import { CompressionFraming } from '@flighthq/types';

import {
  compressDeflate,
  compressDeflateZlib,
  compressLzma,
  decompressDeflate,
  decompressLzma,
  initCompressionWasm,
} from './compressionWasm.ts';

describe('compression-wasm wiring', () => {
  it('initializes without error', () => {
    expect(() => initCompressionWasm()).not.toThrow();
  });

  it('round-trips deflate raw', () => {
    const input = new TextEncoder().encode('hello wasm bridge');
    const compressed = compressDeflate(input);
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.length).toBeGreaterThan(0);
    const decompressed = decompressDeflate(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
  });

  it('round-trips deflate zlib', () => {
    const input = new TextEncoder().encode('hello wasm bridge zlib');
    const compressed = compressDeflateZlib(input);
    expect(compressed).toBeInstanceOf(Uint8Array);
    const decompressed = decompressDeflate(compressed, input.length, CompressionFraming.Rfc1950);
    expect(decompressed).toEqual(input);
  });

  it('round-trips lzma', () => {
    const input = new TextEncoder().encode('hello wasm bridge lzma');
    const compressed = compressLzma(input);
    expect(compressed).toBeInstanceOf(Uint8Array);
    const decompressed = decompressLzma(compressed, input.length, CompressionFraming.Raw);
    expect(decompressed).toEqual(input);
  });
});
