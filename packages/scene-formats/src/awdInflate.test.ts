import { deflateRawSync, deflateSync } from 'node:zlib';

import { inflateAwdDeflate, registerAwdDeflateDecompressor } from './awdInflate';
import { parseAwd, registerAwdDecompressor } from './awdParse';
import { AWD_COMPRESSION_DEFLATE, AWD_HEADER_BYTES, AWD_MAGIC_0, AWD_MAGIC_1, AWD_MAGIC_2 } from './awdSchema';

// Verifies the vendored inflater reproduces `original` exactly for both zlib-wrapped (what Away3D emits)
// and headerless raw DEFLATE streams, using Node's zlib as the reference compressor.
function expectRoundTrip(original: Uint8Array): void {
  const zlib = new Uint8Array(deflateSync(original));
  expect(inflateAwdDeflate(zlib)).toEqual(original);
  const raw = new Uint8Array(deflateRawSync(original));
  expect(inflateAwdDeflate(raw)).toEqual(original);
}

describe('inflateAwdDeflate', () => {
  it('round-trips empty input', () => {
    expectRoundTrip(new Uint8Array(0));
  });

  it('round-trips a short literal run', () => {
    expectRoundTrip(new TextEncoder().encode('flighthq scene-formats'));
  });

  it('round-trips highly repetitive data through back-references', () => {
    expectRoundTrip(new TextEncoder().encode('abcABC123'.repeat(600)));
  });

  it('round-trips incompressible pseudo-random data (dynamic Huffman)', () => {
    const data = new Uint8Array(8192);
    // Deterministic pseudo-random bytes — no Math.random so the fixture is stable.
    let seed = 0x9e3779b9;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed >>> 16) & 0xff;
    }
    expectRoundTrip(data);
  });

  it('round-trips a stored (level 0) block', () => {
    const data = new TextEncoder().encode('the quick brown fox jumps over the lazy dog');
    const stored = new Uint8Array(deflateSync(data, { level: 0 }));
    expect(inflateAwdDeflate(stored)).toEqual(data);
  });

  it('returns null on a truncated stream rather than throwing', () => {
    const full = new Uint8Array(deflateSync(new TextEncoder().encode('abcABC123'.repeat(600))));
    expect(inflateAwdDeflate(full.subarray(0, 6))).toBeNull();
  });

  it('returns null on a corrupt (invalid block type) stream', () => {
    // 0x78 0x9c is a valid zlib header; 0xff 0xff after it decodes an invalid block type.
    expect(inflateAwdDeflate(new Uint8Array([0x78, 0x9c, 0xff, 0xff]))).toBeNull();
  });
});

describe('registerAwdDeflateDecompressor', () => {
  afterEach(() => registerAwdDecompressor(AWD_COMPRESSION_DEFLATE, null));

  it('wires the vendored inflater so parseAwd imports a zlib-compressed AWD body', () => {
    registerAwdDeflateDecompressor();
    // A valid AWD header whose (empty) body is zlib-compressed: the codec must inflate it cleanly, so
    // parseAwd finishes with no "missing decompressor" / "failed to inflate" warning.
    const compressedBody = new Uint8Array(deflateSync(new Uint8Array(0)));
    const awd = new Uint8Array(AWD_HEADER_BYTES + compressedBody.length);
    awd[0] = AWD_MAGIC_0;
    awd[1] = AWD_MAGIC_1;
    awd[2] = AWD_MAGIC_2;
    awd[3] = 2; // version major
    awd[4] = 1; // version minor
    awd[7] = AWD_COMPRESSION_DEFLATE;
    new DataView(awd.buffer).setUint32(8, compressedBody.length, true);
    awd.set(compressedBody, AWD_HEADER_BYTES);

    const warnings: string[] = [];
    parseAwd(awd, warnings);
    expect(warnings.some((w) => w.includes('decompressor') || w.includes('inflate'))).toBe(false);
  });
});
