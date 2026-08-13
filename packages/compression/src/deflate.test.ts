import { Compression } from '@flighthq/types/contract';

import { getDecompressor, unregisterDecompressor } from './decompressor';
import { inflateDeflate, registerDeflateDecompressor } from './deflate';

// The compressed fixtures below are precomputed with Node's zlib and embedded as base64 rather than
// generated at test time: `scene-formats` is a browser-clean package whose build carries no `@types/node`,
// so a `node:zlib` import fails the `tsc -b` build. Provenance — generated once with node v22.22.1:
//   const b64 = (u8) => Buffer.from(u8).toString('base64');
//   const enc = (s) => new TextEncoder().encode(s);
//   b64(deflateSync(new Uint8Array(0)))                                         // EMPTY
//   b64(deflateSync(enc('flighthq scene-formats')))                            // LITERAL (zlib)
//   b64(deflateRawSync(enc('flighthq scene-formats')))                         // RAW_LITERAL (headerless)
//   b64(deflateSync(enc('abcABC123'.repeat(600))))                            // REPETITIVE
//   b64(deflateSync(enc('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore. '.repeat(12)))) // LOREM (genuine dynamic-Huffman block)
//   b64(deflateSync(enc('the quick brown fox jumps over the lazy dog'), { level: 0 }))  // STORED_L0
// The round-trip assertions still verify the vendored inflater reproduces the original bytes EXACTLY.
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore. ';
const FIXTURES = {
  EMPTY: 'eJwDAAAAAAE=',
  // 64 KB of a repeating byte run, zlib-deflated: 124 bytes expanding 528x — a high but honest ratio.
  HIGH_RATIO:
    'eJztxbEBADAEADC0/H+yQyRLIuv9npAkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIk3W4BATsAKQ==',
  LITERAL: 'eJxLy8lMzyjJKFQoTk7NS9VNyy/KTSwpBgBjVQiv',
  RAW_LITERAL: 'S8vJTM8oyShUKE5OzUvVTcsvyk0sKQYA',
  REPETITIVE: 'eJztxjEBACAIALBMYgIxCdC/g0HcrlXPybtil4iIiIiIiIiIiMgfeU6Y4Pw=',
  LOREM:
    'eJztzdENQyEMQ9FVPEDVSd4SlESVJUIQSfYvQ/STb+v6PL7VwBVlEB++EUw003yh+wztqVkbTbgYnfMLHTxjqJwAygpzQaqtE3N2CqVmohKjfc79G89FLnKRi/wX+QG1gr9k',
  STORED_L0: 'eAEBKwDU/3RoZSBxdWljayBicm93biBmb3gganVtcHMgb3ZlciB0aGUgbGF6eSBkb2dhPA/6',
} as const;

// Decodes a base64 string to bytes with no external dependency (no `atob`/`Buffer`) so the test stays
// browser-clean. The embedded fixtures are canonical base64 (no whitespace, standard alphabet).
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

describe('inflateDeflate', () => {
  it('round-trips empty input', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.EMPTY), 0)).toEqual(new Uint8Array(0));
  });

  it('keeps inflating a stream whose expansion ratio is large but bounded', () => {
    // The inflate cap must not fire on real content. AWD bodies are float arrays with long repeating
    // runs, so a high ratio is ORDINARY here — the cap is for a ratio that is unbounded, not merely
    // large, and one that rejected honest compression would be worse than the bomb it prevents. This
    // fixture is 124 bytes expanding 528x to 64 KB, and must still round-trip byte for byte.
    const source = new Uint8Array(64 * 1024);
    for (let i = 0; i < source.length; i++) source[i] = i % 7;
    expect(inflateDeflate(decodeBase64(FIXTURES.HIGH_RATIO), 0)).toEqual(source);
  });

  it('stops expansion at the container-declared output bound', () => {
    const compressed = decodeBase64(FIXTURES.HIGH_RATIO);
    expect(inflateDeflate(compressed, 64 * 1024)).toHaveLength(64 * 1024);
    expect(inflateDeflate(compressed, 64 * 1024 - 1)).toBeNull();
  });

  it('round-trips a short literal run (zlib-wrapped)', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.LITERAL), 0)).toEqual(encode('flighthq scene-formats'));
  });

  it('round-trips a headerless raw DEFLATE stream via the fallback path', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.RAW_LITERAL), 0)).toEqual(encode('flighthq scene-formats'));
  });

  it('round-trips highly repetitive data through back-references and grows the output buffer', () => {
    // 5400 bytes out — past the 1024-byte initial buffer, exercising the grow path.
    expect(inflateDeflate(decodeBase64(FIXTURES.REPETITIVE), 0)).toEqual(encode('abcABC123'.repeat(600)));
  });

  it('round-trips prose through a genuine dynamic-Huffman block', () => {
    // Verified offline that zlib emits BTYPE=2 (dynamic Huffman) for this input, exercising the
    // dynamic literal/length + distance code-length decode path.
    expect(inflateDeflate(decodeBase64(FIXTURES.LOREM), 0)).toEqual(encode(LOREM.repeat(12)));
  });

  it('round-trips a stored (level 0) block', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.STORED_L0), 0)).toEqual(
      encode('the quick brown fox jumps over the lazy dog'),
    );
  });

  it('returns null on a truncated stream rather than throwing', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.REPETITIVE).subarray(0, 6), 0)).toBeNull();
  });

  it('returns null on a corrupt (invalid block type) stream', () => {
    // 0x78 0x9c is a valid zlib header; 0xff 0xff after it decodes an invalid block type.
    expect(inflateDeflate(new Uint8Array([0x78, 0x9c, 0xff, 0xff]), 0)).toBeNull();
  });
});

describe('registerDeflateDecompressor', () => {
  afterEach(() => unregisterDecompressor(Compression.Deflate));

  it('puts the inflater in the shared registry every consumer resolves through', () => {
    expect(getDecompressor(Compression.Deflate)).toBeNull();

    registerDeflateDecompressor();

    // One registration is what every container format reads through — none of them owns its own registry.
    expect(getDecompressor(Compression.Deflate)).toBe(inflateDeflate);
    expect(getDecompressor(Compression.Deflate)?.(decodeBase64(FIXTURES.LITERAL), 0)).toEqual(
      encode('flighthq scene-formats'),
    );
  });
});
