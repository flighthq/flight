import { decodeUTF8, encodeUTF8 } from './utf8';

describe('decodeUTF8', () => {
  it('decodes empty and ASCII input', () => {
    expect(decodeUTF8(new Uint8Array())).toBe('');
    expect(decodeUTF8(Uint8Array.of(0, 72, 101, 108, 108, 111, 0x7f))).toBe('\0Hello\u007f');
  });

  it('decodes two-, three-, and four-byte sequences', () => {
    expect(decodeUTF8(Uint8Array.of(0xc2, 0xa2, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80))).toBe('¢€😀');
  });

  it('replaces malformed and incomplete sequences without consuming the next valid byte', () => {
    expect(decodeUTF8(Uint8Array.of(0x80, 0xc0, 0xaf))).toBe('���');
    expect(decodeUTF8(Uint8Array.of(0xe2, 0x28, 0xa1))).toBe('�(�');
    expect(decodeUTF8(Uint8Array.of(0xed, 0xa0, 0x80))).toBe('���');
    expect(decodeUTF8(Uint8Array.of(0xe2, 0x82))).toBe('�');
  });

  it('honors offset and length windows without reading adjacent bytes', () => {
    const bytes = Uint8Array.of(0xff, 72, 0xc3, 0xa9, 0xff);
    expect(decodeUTF8(bytes, 1, 3)).toBe('Hé');
    expect(decodeUTF8(bytes, 1, 0)).toBe('');
    expect(decodeUTF8(bytes, 5)).toBe('');
    expect(decodeUTF8(Uint8Array.of(0xe2, 0x82, 0xac), 0, 2)).toBe('�');
  });

  it('rejects windows outside the byte array', () => {
    const bytes = Uint8Array.of(65);
    expect(() => decodeUTF8(bytes, -1)).toThrow(RangeError);
    expect(() => decodeUTF8(bytes, 0, 2)).toThrow(RangeError);
  });
});

describe('encodeUTF8', () => {
  it('encodes empty and ASCII input', () => {
    expect(encodeUTF8('')).toEqual(new Uint8Array());
    expect(encodeUTF8('\0Hello\u007f')).toEqual(Uint8Array.of(0, 72, 101, 108, 108, 111, 0x7f));
  });

  it('encodes two-, three-, and four-byte sequences', () => {
    expect(encodeUTF8('¢€😀')).toEqual(Uint8Array.of(0xc2, 0xa2, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80));
  });

  it('encodes unpaired surrogates as the replacement character', () => {
    expect(encodeUTF8('\ud800A\udc00')).toEqual(Uint8Array.of(0xef, 0xbf, 0xbd, 65, 0xef, 0xbf, 0xbd));
    expect(encodeUTF8('\ufffd')).toEqual(Uint8Array.of(0xef, 0xbf, 0xbd));
  });
});
