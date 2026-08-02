import { SwfCompression } from '@flighthq/types/contract';

import { getSwfDecompressor, registerSwfDecompressor, unregisterSwfDecompressor } from './swfDecompressor';

describe('getSwfDecompressor', () => {
  it('reports nothing registered rather than throwing', () => {
    expect(getSwfDecompressor(SwfCompression.Zlib)).toBeNull();
    expect(getSwfDecompressor(SwfCompression.Lzma)).toBeNull();
  });
});

describe('registerSwfDecompressor', () => {
  afterEach(() => {
    unregisterSwfDecompressor(SwfCompression.Zlib);
  });

  it('registers a decompressor per compression form, last write winning', () => {
    const first = (): Uint8Array => new Uint8Array([1]);
    const second = (): Uint8Array => new Uint8Array([2]);

    registerSwfDecompressor(SwfCompression.Zlib, first);
    expect(getSwfDecompressor(SwfCompression.Zlib)).toBe(first);
    // A host replacing a portable decoder with a native one relies on last-write-wins.
    registerSwfDecompressor(SwfCompression.Zlib, second);
    expect(getSwfDecompressor(SwfCompression.Zlib)).toBe(second);
    // Registering one form leaves the other alone.
    expect(getSwfDecompressor(SwfCompression.Lzma)).toBeNull();
  });
});

describe('unregisterSwfDecompressor', () => {
  it('removes a registration and is safe when none exists', () => {
    registerSwfDecompressor(SwfCompression.Zlib, () => new Uint8Array());
    unregisterSwfDecompressor(SwfCompression.Zlib);
    expect(getSwfDecompressor(SwfCompression.Zlib)).toBeNull();
    expect(() => unregisterSwfDecompressor(SwfCompression.Zlib)).not.toThrow();
  });
});
