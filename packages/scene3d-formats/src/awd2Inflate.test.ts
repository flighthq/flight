import type { ImportDiagnostic } from '@flighthq/types/contract';

import { inflateAwdDeflate, registerAwd2DeflateDecompressor } from './awd2Inflate';
import { parseAwd2, registerAwd2Decompressor } from './awd2Parse';
import { AWD2_COMPRESSION_DEFLATE, AWD2_HEADER_BYTES, AWD2_MAGIC_0, AWD2_MAGIC_1, AWD2_MAGIC_2 } from './awd2Schema';

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

describe('inflateAwdDeflate', () => {
  it('round-trips empty input', () => {
    expect(inflateAwdDeflate(decodeBase64(FIXTURES.EMPTY))).toEqual(new Uint8Array(0));
  });

  it('round-trips a short literal run (zlib-wrapped)', () => {
    expect(inflateAwdDeflate(decodeBase64(FIXTURES.LITERAL))).toEqual(encode('flighthq scene-formats'));
  });

  it('round-trips a headerless raw DEFLATE stream via the fallback path', () => {
    expect(inflateAwdDeflate(decodeBase64(FIXTURES.RAW_LITERAL))).toEqual(encode('flighthq scene-formats'));
  });

  it('round-trips highly repetitive data through back-references and grows the output buffer', () => {
    // 5400 bytes out — past the 1024-byte initial buffer, exercising the grow path.
    expect(inflateAwdDeflate(decodeBase64(FIXTURES.REPETITIVE))).toEqual(encode('abcABC123'.repeat(600)));
  });

  it('round-trips prose through a genuine dynamic-Huffman block', () => {
    // Verified offline that zlib emits BTYPE=2 (dynamic Huffman) for this input, exercising the
    // dynamic literal/length + distance code-length decode path.
    expect(inflateAwdDeflate(decodeBase64(FIXTURES.LOREM))).toEqual(encode(LOREM.repeat(12)));
  });

  it('round-trips a stored (level 0) block', () => {
    expect(inflateAwdDeflate(decodeBase64(FIXTURES.STORED_L0))).toEqual(
      encode('the quick brown fox jumps over the lazy dog'),
    );
  });

  it('returns null on a truncated stream rather than throwing', () => {
    expect(inflateAwdDeflate(decodeBase64(FIXTURES.REPETITIVE).subarray(0, 6))).toBeNull();
  });

  it('returns null on a corrupt (invalid block type) stream', () => {
    // 0x78 0x9c is a valid zlib header; 0xff 0xff after it decodes an invalid block type.
    expect(inflateAwdDeflate(new Uint8Array([0x78, 0x9c, 0xff, 0xff]))).toBeNull();
  });
});

describe('registerAwd2DeflateDecompressor', () => {
  afterEach(() => registerAwd2Decompressor(AWD2_COMPRESSION_DEFLATE, null));

  it('wires the vendored inflater so parseAwd2 imports a zlib-compressed AWD body', () => {
    registerAwd2DeflateDecompressor();
    // A valid AWD header whose (empty) body is a real zlib stream: the codec must inflate it cleanly, so
    // parseAwd2 finishes with no "missing decompressor" / "failed to inflate" diagnostic.
    const compressedBody = decodeBase64(FIXTURES.EMPTY);
    const awd = new Uint8Array(AWD2_HEADER_BYTES + compressedBody.length);
    awd[0] = AWD2_MAGIC_0;
    awd[1] = AWD2_MAGIC_1;
    awd[2] = AWD2_MAGIC_2;
    awd[3] = 2; // version major
    awd[4] = 1; // version minor
    awd[7] = AWD2_COMPRESSION_DEFLATE;
    new DataView(awd.buffer).setUint32(8, compressedBody.length, true);
    awd.set(compressedBody, AWD2_HEADER_BYTES);

    const diagnostics: ImportDiagnostic[] = [];
    parseAwd2(awd, diagnostics);
    expect(
      diagnostics.some((d) => d.kind === 'awd2.compression-no-decompressor' || d.kind === 'awd2.decompression-failed'),
    ).toBe(false);
  });
});
