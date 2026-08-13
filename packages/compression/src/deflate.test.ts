import { Compression, CompressionFraming } from '@flighthq/types/contract';

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

function decodeHex(input: string): Uint8Array {
  const out = new Uint8Array(input.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(input.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function packDeflateBits(bits: readonly number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) out[i >> 3] |= bits[i] << (i & 7);
  return out;
}

function pushLsbValue(bits: number[], value: number, count: number): void {
  for (let i = 0; i < count; i++) bits.push((value >> i) & 1);
}

function pushCanonicalCode(bits: number[], code: number, count: number): void {
  // DEFLATE transmits a Huffman code from its most-significant bit while packing those bits into each
  // byte least-significant first. Keeping those two directions separate makes the malformed fixtures
  // below readable instead of hiding their discriminator in opaque hex.
  for (let i = count - 1; i >= 0; i--) bits.push((code >> i) & 1);
}

function pushFixedLiteralCode(bits: number[], symbol: number): void {
  if (symbol <= 143) pushCanonicalCode(bits, 0x30 + symbol, 8);
  else if (symbol <= 255) pushCanonicalCode(bits, 0x190 + symbol - 144, 9);
  else if (symbol <= 279) pushCanonicalCode(bits, symbol - 256, 7);
  else pushCanonicalCode(bits, 0xc0 + symbol - 280, 8);
}

function createFixedBackReferenceStream(lengthSymbol: number, distanceSymbol?: number): Uint8Array {
  const bits: number[] = [];
  pushLsbValue(bits, 1, 1); // BFINAL
  pushLsbValue(bits, 1, 2); // BTYPE=fixed Huffman
  pushFixedLiteralCode(bits, lengthSymbol);
  if (distanceSymbol !== undefined) pushCanonicalCode(bits, distanceSymbol, 5);
  return packDeflateBits(bits);
}

const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15] as const;

function pushDynamicHeader(
  bits: number[],
  literalCount: number,
  distanceCount: number,
  codeLengths: ReadonlyMap<number, number>,
): void {
  pushLsbValue(bits, 1, 1); // BFINAL
  pushLsbValue(bits, 2, 2); // BTYPE=dynamic Huffman
  pushLsbValue(bits, literalCount - 257, 5);
  pushLsbValue(bits, distanceCount - 1, 5);
  let codeLengthCount = 4;
  for (let i = 0; i < CODE_LENGTH_ORDER.length; i++) {
    if ((codeLengths.get(CODE_LENGTH_ORDER[i]) ?? 0) !== 0) codeLengthCount = i + 1;
  }
  pushLsbValue(bits, codeLengthCount - 4, 4);
  for (let i = 0; i < codeLengthCount; i++) pushLsbValue(bits, codeLengths.get(CODE_LENGTH_ORDER[i]) ?? 0, 3);
}

function createDynamicRepeatOverflowStream(symbol: 16 | 17 | 18): Uint8Array {
  const bits: number[] = [];
  // Code-length symbols 0, 1, and the repeat have canonical codes 0, 10, and 11. The table first
  // declares 256 unused literals and an EOB of length one. The repeat then starts at the final distance
  // slot but asks for at least three entries. A truncating decoder turns that into a valid empty block;
  // a conforming decoder rejects the overrun before it can be hidden by the table boundary.
  pushDynamicHeader(
    bits,
    257,
    1,
    new Map([
      [0, 1],
      [1, 2],
      [symbol, 2],
    ]),
  );
  for (let i = 0; i < 256; i++) pushCanonicalCode(bits, 0, 1);
  pushCanonicalCode(bits, 2, 2); // symbol 1: EOB length
  pushCanonicalCode(bits, 3, 2); // repeat symbol
  pushLsbValue(bits, 0, symbol === 16 ? 2 : symbol === 17 ? 3 : 7);
  pushCanonicalCode(bits, 0, 1); // EOB in the block a truncating decoder would accept
  return packDeflateBits(bits);
}

function createValidDynamicRepeatStream(symbol: 16 | 17 | 18): Uint8Array {
  const bits: number[] = [];
  if (symbol === 16) {
    // Symbols 0, 2, 16 use codes 0, 10, 11. After 254 zero lengths, length 2 is repeated three times,
    // filling literal 254, literal 255, EOB 256, and the sole distance entry exactly.
    pushDynamicHeader(
      bits,
      257,
      1,
      new Map([
        [0, 1],
        [2, 2],
        [16, 2],
      ]),
    );
    for (let i = 0; i < 254; i++) pushCanonicalCode(bits, 0, 1);
    pushCanonicalCode(bits, 2, 2);
    pushCanonicalCode(bits, 3, 2);
    pushLsbValue(bits, 0, 2);
    pushCanonicalCode(bits, 2, 2); // literal 256 is the third length-2 code
  } else {
    // Symbols 0, 1, repeat use codes 0, 10, 11. A legal minimum repeat begins the zero run; explicit
    // zeroes finish literals 0-255, then EOB gets length one and the distance entry stays unused.
    pushDynamicHeader(
      bits,
      257,
      1,
      new Map([
        [0, 1],
        [1, 2],
        [symbol, 2],
      ]),
    );
    pushCanonicalCode(bits, 3, 2);
    pushLsbValue(bits, 0, symbol === 17 ? 3 : 7);
    const repeat = symbol === 17 ? 3 : 11;
    for (let i = repeat; i < 256; i++) pushCanonicalCode(bits, 0, 1);
    pushCanonicalCode(bits, 2, 2);
    pushCanonicalCode(bits, 0, 1);
    pushCanonicalCode(bits, 0, 1); // EOB
  }
  return packDeflateBits(bits);
}

function createReservedDynamicDistanceStream(): Uint8Array {
  const bits: number[] = [];
  // Literal 256 (EOB) and 257 (length 3) are the two one-bit literal codes. Distance 30 is the only
  // distance code. It is representable in the dynamic alphabet but reserved by RFC 1951.
  pushDynamicHeader(
    bits,
    258,
    31,
    new Map([
      [0, 1],
      [1, 1],
    ]),
  );
  for (let i = 0; i < 256; i++) pushCanonicalCode(bits, 0, 1);
  pushCanonicalCode(bits, 1, 1);
  pushCanonicalCode(bits, 1, 1);
  for (let i = 0; i < 30; i++) pushCanonicalCode(bits, 0, 1);
  pushCanonicalCode(bits, 1, 1);
  pushCanonicalCode(bits, 1, 1); // literal 257
  pushCanonicalCode(bits, 0, 1); // reserved distance 30
  return packDeflateBits(bits);
}

function createRawStoredStreamStartingWithZlibHeader(): { payload: Uint8Array; stream: Uint8Array } {
  const payload = new Uint8Array(156);
  for (let i = 0; i < payload.length; i++) payload[i] = i;

  const stream = new Uint8Array(1 + 4 + payload.length + 5);
  // 0x78 has BFINAL=0/BTYPE=00 in its low three bits. The remaining padding bits are ignored; the next
  // byte is LEN=0x009c, so the valid raw stream deliberately begins with the common zlib header 78 9c.
  stream.set([0x78, 0x9c, 0x00, 0x63, 0xff]);
  stream.set(payload, 5);
  stream.set([0x01, 0x00, 0x00, 0xff, 0xff], 5 + payload.length);
  return { payload, stream };
}

describe('inflateDeflate', () => {
  it('round-trips empty input', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.EMPTY), 0, CompressionFraming.Rfc1950)).toEqual(new Uint8Array(0));
  });

  it('keeps inflating a stream whose expansion ratio is large but bounded', () => {
    // The inflate cap must not fire on real content. AWD bodies are float arrays with long repeating
    // runs, so a high ratio is ORDINARY here — the cap is for a ratio that is unbounded, not merely
    // large, and one that rejected honest compression would be worse than the bomb it prevents. This
    // fixture is 124 bytes expanding 528x to 64 KB, and must still round-trip byte for byte.
    const source = new Uint8Array(64 * 1024);
    for (let i = 0; i < source.length; i++) source[i] = i % 7;
    expect(inflateDeflate(decodeBase64(FIXTURES.HIGH_RATIO), 0, CompressionFraming.Rfc1950)).toEqual(source);
  });

  it('stops expansion at the container-declared output bound', () => {
    const compressed = decodeBase64(FIXTURES.HIGH_RATIO);
    expect(inflateDeflate(compressed, 64 * 1024, CompressionFraming.Rfc1950)).toHaveLength(64 * 1024);
    expect(inflateDeflate(compressed, 64 * 1024 - 1, CompressionFraming.Rfc1950)).toBeNull();
  });

  it('round-trips a short literal run (zlib-wrapped)', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.LITERAL), 0, CompressionFraming.Rfc1950)).toEqual(
      encode('flighthq scene-formats'),
    );
  });

  it('round-trips a headerless raw DEFLATE stream when explicitly requested', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.RAW_LITERAL), 0, CompressionFraming.Raw)).toEqual(
      encode('flighthq scene-formats'),
    );
  });

  it('does not mistake a valid raw stream beginning 78 9c for zlib framing', () => {
    const { payload, stream } = createRawStoredStreamStartingWithZlibHeader();
    expect(inflateDeflate(stream, payload.length, CompressionFraming.Raw)).toEqual(payload);
    expect(inflateDeflate(stream, payload.length, CompressionFraming.Rfc1950)).toBeNull();
  });

  it('round-trips highly repetitive data through back-references and grows the output buffer', () => {
    // 5400 bytes out — past the 1024-byte initial buffer, exercising the grow path.
    expect(inflateDeflate(decodeBase64(FIXTURES.REPETITIVE), 0, CompressionFraming.Rfc1950)).toEqual(
      encode('abcABC123'.repeat(600)),
    );
  });

  it('round-trips prose through a genuine dynamic-Huffman block', () => {
    // Verified offline that zlib emits BTYPE=2 (dynamic Huffman) for this input, exercising the
    // dynamic literal/length + distance code-length decode path.
    expect(inflateDeflate(decodeBase64(FIXTURES.LOREM), 0, CompressionFraming.Rfc1950)).toEqual(
      encode(LOREM.repeat(12)),
    );
  });

  it('round-trips a stored (level 0) block', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.STORED_L0), 0, CompressionFraming.Rfc1950)).toEqual(
      encode('the quick brown fox jumps over the lazy dog'),
    );
  });

  it('returns null on a truncated stream rather than throwing', () => {
    expect(inflateDeflate(decodeBase64(FIXTURES.REPETITIVE).subarray(0, 6), 0, CompressionFraming.Rfc1950)).toBeNull();
  });

  it('returns null on a corrupt (invalid block type) stream', () => {
    // 0x78 0x9c is a valid zlib header; 0xff 0xff after it decodes an invalid block type.
    expect(
      inflateDeflate(new Uint8Array([0x78, 0x9c, 0xff, 0xff, 0, 0, 0, 0]), 0, CompressionFraming.Rfc1950),
    ).toBeNull();
  });

  it('rejects undersized zlib wrappers and unknown framing values', () => {
    expect(inflateDeflate(new Uint8Array([0x78, 0x9c, 0, 0, 0]), 0, CompressionFraming.Rfc1950)).toBeNull();
    expect(inflateDeflate(decodeBase64(FIXTURES.RAW_LITERAL), 0, 'Unknown' as never)).toBeNull();
  });

  it('rejects truncated stored-block headers and payloads', () => {
    expect(inflateDeflate(new Uint8Array([0x01, 0, 0]), 0, CompressionFraming.Raw)).toBeNull();
    expect(inflateDeflate(new Uint8Array([0x01, 0x02, 0, 0xfd, 0xff, 0x41]), 0, CompressionFraming.Raw)).toBeNull();
  });

  it('rejects reserved fixed length symbols and back-references before the output', () => {
    expect(inflateDeflate(createFixedBackReferenceStream(286), 0, CompressionFraming.Raw)).toBeNull();
    expect(inflateDeflate(createFixedBackReferenceStream(257, 0), 0, CompressionFraming.Raw)).toBeNull();
  });

  it('rejects a reserved dynamic distance symbol', () => {
    expect(inflateDeflate(createReservedDynamicDistanceStream(), 0, CompressionFraming.Raw)).toBeNull();
  });

  it('rejects a missing or corrupt zlib Adler-32 trailer', () => {
    const valid = decodeBase64(FIXTURES.LITERAL);
    const corrupt = valid.slice();
    corrupt[corrupt.length - 1] ^= 1;
    expect(inflateDeflate(valid.subarray(0, valid.length - 4), 0, CompressionFraming.Rfc1950)).toBeNull();
    expect(inflateDeflate(corrupt, 0, CompressionFraming.Rfc1950)).toBeNull();
  });

  it('rejects illegal zlib methods, window sizes, check bits, and preset dictionaries', () => {
    const illegalMethod = decodeBase64(FIXTURES.LITERAL);
    illegalMethod[0] = 0x77;
    illegalMethod[1] = 0x09; // FCHECK-valid for CM=7, so only the forbidden compression method rejects it.
    expect(inflateDeflate(illegalMethod, 0, CompressionFraming.Rfc1950)).toBeNull();

    const illegalWindow = decodeBase64(FIXTURES.LITERAL);
    illegalWindow[0] = 0xf8;
    illegalWindow[1] = 0x00;
    expect(inflateDeflate(illegalWindow, 0, CompressionFraming.Rfc1950)).toBeNull();

    const illegalCheck = decodeBase64(FIXTURES.LITERAL);
    illegalCheck[1] ^= 1;
    expect(inflateDeflate(illegalCheck, 0, CompressionFraming.Rfc1950)).toBeNull();

    const presetDictionary = decodeBase64(FIXTURES.LITERAL);
    presetDictionary[1] = 0xbb;
    expect(inflateDeflate(presetDictionary, 0, CompressionFraming.Rfc1950)).toBeNull();
  });

  it('rejects a dynamic code-length repeat that exceeds the declared table', () => {
    expect(inflateDeflate(decodeHex('05c0050900000000a0ffaf15'), 0, CompressionFraming.Raw)).toEqual(new Uint8Array());
    expect(inflateDeflate(decodeHex('05c0050900000000a0ffaf0d'), 0, CompressionFraming.Raw)).toBeNull();
  });

  it.each([16, 17, 18] as const)('rejects dynamic repeat symbol %i when it exceeds the declared table', (symbol) => {
    expect(inflateDeflate(createDynamicRepeatOverflowStream(symbol), 0, CompressionFraming.Raw)).toBeNull();
  });

  it('accepts every dynamic repeat form when it ends inside the declared table', () => {
    for (const symbol of [16, 17, 18] as const) {
      expect(inflateDeflate(createValidDynamicRepeatStream(symbol), 0, CompressionFraming.Raw)).toEqual(
        new Uint8Array(),
      );
    }
  });

  it('rejects a previous-length repeat before any length has been declared', () => {
    const bits: number[] = [];
    pushDynamicHeader(
      bits,
      257,
      1,
      new Map([
        [0, 1],
        [1, 2],
        [16, 2],
      ]),
    );
    pushCanonicalCode(bits, 3, 2);
    expect(inflateDeflate(packDeflateBits(bits), 0, CompressionFraming.Raw)).toBeNull();
  });

  it('rejects forbidden dynamic literal counts without rejecting the maximum valid count', () => {
    expect(inflateDeflate(decodeHex('edc0210900000000a0ffaf5d22'), 0, CompressionFraming.Raw)).toEqual(
      new Uint8Array(),
    );
    expect(inflateDeflate(decodeHex('f5c0210900000000a0ffaf7d22'), 0, CompressionFraming.Raw)).toBeNull();
    expect(inflateDeflate(decodeHex('fdc0210900000000a0ffaf9d22'), 0, CompressionFraming.Raw)).toBeNull();
  });
});

describe('registerDeflateDecompressor', () => {
  afterEach(() => unregisterDecompressor(Compression.Deflate));

  it('puts the inflater in the shared registry every consumer resolves through', () => {
    expect(getDecompressor(Compression.Deflate)).toBeNull();

    registerDeflateDecompressor();

    // One registration is what every container format reads through — none of them owns its own registry.
    expect(getDecompressor(Compression.Deflate)).toBe(inflateDeflate);
    expect(
      getDecompressor(Compression.Deflate)?.(decodeBase64(FIXTURES.LITERAL), 0, CompressionFraming.Rfc1950),
    ).toEqual(encode('flighthq scene-formats'));
  });
});
