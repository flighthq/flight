import { Compression } from '@flighthq/types/contract';

import { getDecompressor, hasDecompressor, registerDecompressor, unregisterDecompressor } from './decompressor';

describe('getDecompressor', () => {
  it('reports nothing registered rather than throwing', () => {
    expect(getDecompressor(Compression.Deflate)).toBeNull();
    expect(getDecompressor(Compression.Lzma)).toBeNull();
  });
});

describe('hasDecompressor', () => {
  afterEach(() => unregisterDecompressor(Compression.Lzma));

  it('answers without handing back the implementation', () => {
    expect(hasDecompressor(Compression.Lzma)).toBe(false);
    registerDecompressor(Compression.Lzma, () => null);
    expect(hasDecompressor(Compression.Lzma)).toBe(true);
  });
});

describe('registerDecompressor', () => {
  afterEach(() => {
    unregisterDecompressor(Compression.Deflate);
    unregisterDecompressor(Compression.Lzma);
  });

  it('registers per algorithm, last write winning', () => {
    const first = (): Uint8Array => new Uint8Array([1]);
    const second = (): Uint8Array => new Uint8Array([2]);

    registerDecompressor(Compression.Deflate, first);
    expect(getDecompressor(Compression.Deflate)).toBe(first);
    // A host replacing a portable decoder with a native or wasm one relies on last-write-wins.
    registerDecompressor(Compression.Deflate, second);
    expect(getDecompressor(Compression.Deflate)).toBe(second);
    // Registering one algorithm leaves the others alone.
    expect(getDecompressor(Compression.Lzma)).toBeNull();
  });

  it('serves every consumer from the one registration', () => {
    const decompress = (): Uint8Array => new Uint8Array([7]);
    registerDecompressor(Compression.Deflate, decompress);

    // Whatever container asks — a SWF body, an AWD2 block — resolves the same implementation.
    expect(getDecompressor(Compression.Deflate)).toBe(decompress);
    expect(getDecompressor(Compression.Deflate)).toBe(getDecompressor(Compression.Deflate));
  });
});

describe('unregisterDecompressor', () => {
  it('removes a registration and is safe when none exists', () => {
    registerDecompressor(Compression.Deflate, () => new Uint8Array());
    unregisterDecompressor(Compression.Deflate);
    expect(getDecompressor(Compression.Deflate)).toBeNull();
    expect(() => unregisterDecompressor(Compression.Deflate)).not.toThrow();
  });
});
