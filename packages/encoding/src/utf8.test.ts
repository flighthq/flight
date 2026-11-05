// Generated from crates/flight-encoding/tests/utf8_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { decodeUTF8, encodeUTF8 } from './contract.ts';

describe('decodeUTF8', () => {
  it('decodes empty and ascii input', () => {
    expect(decodeUTF8(new Uint8Array([]), undefined, undefined)).toEqual('');
    expect(decodeUTF8(new Uint8Array([0, 72, 101, 108, 108, 111, 0x7f]), undefined, undefined)).toEqual('\0Hello\x7f');
  });
  it('decodes two three and four byte sequences', () => {
    expect(
      decodeUTF8(new Uint8Array([0xc2, 0xa2, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]), undefined, undefined),
    ).toEqual('¢€😀');
  });
  it('replaces malformed and incomplete sequences without consuming the next valid byte', () => {
    expect(decodeUTF8(new Uint8Array([0x80, 0xc0, 0xaf]), undefined, undefined)).toEqual('���');
    expect(decodeUTF8(new Uint8Array([0xe2, 0x28, 0xa1]), undefined, undefined)).toEqual('�(�');
    expect(decodeUTF8(new Uint8Array([0xed, 0xa0, 0x80]), undefined, undefined)).toEqual('���');
    expect(decodeUTF8(new Uint8Array([0xe2, 0x82]), undefined, undefined)).toEqual('�');
  });
  it('honors offset and length windows without reading adjacent bytes', () => {
    const bytes: Readonly<number[]> = [0xff, 72, 0xc3, 0xa9, 0xff];
    expect(decodeUTF8(new Uint8Array(bytes), 1, 3)).toEqual('Hé');
    expect(decodeUTF8(new Uint8Array(bytes), 1, 0)).toEqual('');
    expect(decodeUTF8(new Uint8Array(bytes), 5, undefined)).toEqual('');
    expect(decodeUTF8(new Uint8Array([0xe2, 0x82, 0xac]), 0, 2)).toEqual('�');
  });
  it('rejects windows outside the byte array', () => {
    expect(() => {
      return decodeUTF8(new Uint8Array([65]), -1, undefined);
    }).toThrow(new RangeError('decodeUTF8 window is outside the byte array'));
    expect(() => {
      return decodeUTF8(new Uint8Array([65]), 0, 2);
    }).toThrow(new RangeError('decodeUTF8 window is outside the byte array'));
  });
  it('rejects offset beyond end with omitted length', () => {
    expect(() => {
      return decodeUTF8(new Uint8Array([65]), 5, undefined);
    }).toThrow(new RangeError('decodeUTF8 window is outside the byte array'));
  });
  it('rejects offset beyond end with explicit length', () => {
    expect(() => {
      return decodeUTF8(new Uint8Array([65]), 5, 1);
    }).toThrow(new RangeError('decodeUTF8 window is outside the byte array'));
  });
  it('rejects huge length that overflows usize', () => {
    expect(() => {
      return decodeUTF8(new Uint8Array([65]), 1, 0xffffffff);
    }).toThrow(new RangeError('decodeUTF8 window is outside the byte array'));
  });
});

describe('encodeUTF8', () => {
  it('encodes empty and ascii input', () => {
    const empty: Uint8Array = new Uint8Array([]);
    expect(encodeUTF8('')).toEqual(empty);
    expect(Array.from(encodeUTF8('\0Hello\x7f'))).toEqual([0, 72, 101, 108, 108, 111, 0x7f]);
  });
  it('encodes two three and four byte sequences', () => {
    expect(Array.from(encodeUTF8('¢€😀'))).toEqual([0xc2, 0xa2, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]);
  });
  it('encodes the replacement character', () => {
    expect(Array.from(encodeUTF8('\ud800A\udc00'))).toEqual([0xef, 0xbf, 0xbd, 65, 0xef, 0xbf, 0xbd]);
    expect(Array.from(encodeUTF8('�'))).toEqual([0xef, 0xbf, 0xbd]);
  });
});
