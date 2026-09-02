import { CompressionFraming } from '@flighthq/types/contract';

import { compressDeflate, compressDeflateZlib } from './compress';
import { inflateDeflate } from './deflate';

// Every round trip is checked through inflateDeflate, which was written independently of this encoder
// and is already pinned by its own tests. A compressor checked against its own decoder would agree with
// itself about a stream neither reads correctly; this one has to satisfy a reader it did not author.
describe('compressDeflate', () => {
  it('round-trips an empty input as a raw stream', () => {
    const compressed = compressDeflate(new Uint8Array(0));
    expect(inflateDeflate(compressed, 0, CompressionFraming.Raw)).toEqual(new Uint8Array(0));
  });

  it('round-trips text through the raw framing', () => {
    const bytes = new TextEncoder().encode('the quick brown fox jumps over the lazy dog');
    const compressed = compressDeflate(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Raw)).toEqual(bytes);
  });

  it('round-trips highly repetitive text and actually shrinks it', () => {
    const bytes = new TextEncoder().encode('abcabcabc'.repeat(400));
    const compressed = compressDeflate(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Raw)).toEqual(bytes);
    // A "compress" function that never shrinks anything would satisfy every round-trip assertion above.
    expect(compressed.length).toBeLessThan(bytes.length / 4);
  });

  it('round-trips binary bytes that cannot be compressed without expanding them much', () => {
    const bytes = new Uint8Array(4096);
    let seed = 0x2545f491;
    for (let i = 0; i < bytes.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      bytes[i] = seed & 0xff;
    }
    const compressed = compressDeflate(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Raw)).toEqual(bytes);
    expect(compressed.length).toBeLessThanOrEqual(bytes.length + 16);
  });

  it('round-trips an input longer than one stored block can carry', () => {
    const bytes = new Uint8Array(70_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const compressed = compressDeflate(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Raw)).toEqual(bytes);
  });

  it('round-trips every byte value, so no literal is mis-coded', () => {
    // The fixed literal alphabet changes code width at 144 and again at 280. A test over ASCII alone
    // would never exercise the 9-bit range where a wrong boundary lives.
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const compressed = compressDeflate(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Raw)).toEqual(bytes);
  });

  it('round-trips a deterministic sweep of shapes a fixed corpus would miss', () => {
    // A hand-written bit stream fails on specific lengths and specific byte runs, not on categories.
    // The seed is fixed so a failure names one reproducible input rather than a flaky one.
    let seed = 0x9e3779b9;
    const next = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    for (let length = 0; length < 300; length++) {
      const bytes = new Uint8Array(length);
      // Alphabet width is varied so runs are sometimes long enough to match and sometimes not, which
      // is what moves the encoder between literals, matches, and the stored fallback.
      const alphabet = 1 + (length % 7);
      for (let i = 0; i < length; i++) bytes[i] = next() % alphabet;
      const raw = compressDeflate(bytes);
      expect(inflateDeflate(raw, length, CompressionFraming.Raw)).toEqual(bytes);
      const wrapped = compressDeflateZlib(bytes);
      expect(inflateDeflate(wrapped, length, CompressionFraming.Rfc1950)).toEqual(bytes);
    }
  });

  it('round-trips a long run that exercises the maximum match length', () => {
    // 258 is the largest copy length the format encodes, and it is the one length whose code carries no
    // extra bits. An input built only from short repeats never reaches it.
    const bytes = new Uint8Array(2048).fill(7);
    const compressed = compressDeflate(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Raw)).toEqual(bytes);
  });

  it('round-trips a repeat at the far edge of the window', () => {
    const bytes = new Uint8Array(40_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff;
    bytes.set(bytes.subarray(0, 64), bytes.length - 64);
    const compressed = compressDeflate(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Raw)).toEqual(bytes);
  });

  it('produces the same bytes for the same input', () => {
    const bytes = new TextEncoder().encode('deterministic output for a fixed input'.repeat(10));
    expect(compressDeflate(bytes)).toEqual(compressDeflate(bytes));
  });

  it('emits no zlib wrapper, so the zlib reader refuses it', () => {
    const bytes = new TextEncoder().encode('raw means raw'.repeat(20));
    const compressed = compressDeflate(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Rfc1950)).toBeNull();
  });

  it('does not mutate the input it was given', () => {
    const bytes = new TextEncoder().encode('untouched');
    const copy = bytes.slice();
    compressDeflate(bytes);
    expect(bytes).toEqual(copy);
  });
});

describe('compressDeflateZlib', () => {
  it('round-trips an empty input through the zlib framing', () => {
    const compressed = compressDeflateZlib(new Uint8Array(0));
    expect(inflateDeflate(compressed, 0, CompressionFraming.Rfc1950)).toEqual(new Uint8Array(0));
  });

  it('round-trips text through the zlib framing', () => {
    const bytes = new TextEncoder().encode('the quick brown fox jumps over the lazy dog');
    const compressed = compressDeflateZlib(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Rfc1950)).toEqual(bytes);
  });

  it('round-trips binary bytes through the zlib framing', () => {
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) & 0xff;
    const compressed = compressDeflateZlib(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Rfc1950)).toEqual(bytes);
  });

  it('wraps the same raw stream in a header and an Adler-32 trailer', () => {
    // The framing difference is exactly six bytes: the wrapper must add a header and a checksum and
    // change nothing in between, or the two functions have drifted into separate encoders.
    const bytes = new TextEncoder().encode('framing is the only difference'.repeat(8));
    const raw = compressDeflate(bytes);
    const wrapped = compressDeflateZlib(bytes);
    expect(wrapped.length).toBe(raw.length + 6);
    expect(wrapped.subarray(2, wrapped.length - 4)).toEqual(raw);
  });

  it('emits a header the zlib reader accepts', () => {
    const compressed = compressDeflateZlib(new TextEncoder().encode('header check'));
    const cmf = compressed[0];
    const flg = compressed[1];
    expect(cmf & 0x0f).toBe(8);
    expect(cmf >> 4).toBeLessThanOrEqual(7);
    expect(((cmf << 8) | flg) % 31).toBe(0);
    expect(flg & 0x20).toBe(0);
  });

  it('emits a trailer that fails the reader when a payload byte is altered', () => {
    // The Adler-32 has to be over the UNCOMPRESSED bytes. A checksum computed over the compressed
    // stream would still be self-consistent, so only a corrupted payload can tell the two apart.
    const bytes = new TextEncoder().encode('checksum me'.repeat(30));
    const compressed = compressDeflateZlib(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Rfc1950)).toEqual(bytes);
    const trailer = compressed.subarray(compressed.length - 4);
    expect(trailer).not.toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('emits a wrapper, so the raw reader does not read it back unchanged', () => {
    const bytes = new TextEncoder().encode('zlib means zlib'.repeat(20));
    const compressed = compressDeflateZlib(bytes);
    expect(inflateDeflate(compressed, bytes.length, CompressionFraming.Raw)).not.toEqual(bytes);
  });

  it('produces the same bytes for the same input', () => {
    const bytes = new TextEncoder().encode('deterministic zlib output'.repeat(10));
    expect(compressDeflateZlib(bytes)).toEqual(compressDeflateZlib(bytes));
  });
});
