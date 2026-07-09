import { detectFontFormat, inferFontFormatFromUrl } from './fontFormat';

function bytesOf(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function asciiBytes(text: string): Uint8Array {
  const b = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) b[i] = text.charCodeAt(i);
  return b;
}

describe('detectFontFormat', () => {
  it('returns "truetype" for the 0x00010000 sfnt signature', () => {
    expect(detectFontFormat(bytesOf(0x00, 0x01, 0x00, 0x00))).toBe('truetype');
  });

  it('returns "opentype" for the "OTTO" signature', () => {
    expect(detectFontFormat(asciiBytes('OTTO'))).toBe('opentype');
  });

  it('returns "woff" for the "wOFF" signature', () => {
    expect(detectFontFormat(asciiBytes('wOFF'))).toBe('woff');
  });

  it('returns "woff2" for the "wOF2" signature', () => {
    expect(detectFontFormat(asciiBytes('wOF2'))).toBe('woff2');
  });

  it('returns "collection" for the "ttcf" signature', () => {
    expect(detectFontFormat(asciiBytes('ttcf'))).toBe('collection');
  });

  it('returns "truetype" for the legacy "true" signature', () => {
    expect(detectFontFormat(asciiBytes('true'))).toBe('truetype');
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    expect(detectFontFormat(asciiBytes('wOFF').buffer as ArrayBuffer)).toBe('woff');
  });

  it('ignores trailing bytes past the 4-byte signature', () => {
    expect(detectFontFormat(asciiBytes('OTTO with more data'))).toBe('opentype');
  });

  it('returns null for an unrecognized signature', () => {
    expect(detectFontFormat(asciiBytes('%PDF'))).toBeNull();
  });

  it('returns null when there are fewer than 4 bytes', () => {
    expect(detectFontFormat(bytesOf(0x00, 0x01, 0x00))).toBeNull();
  });
});

describe('inferFontFormatFromUrl', () => {
  it('returns "woff" for .woff files', () => {
    expect(inferFontFormatFromUrl('font.woff')).toBe('woff');
  });

  it('returns "woff2" for .woff2 files', () => {
    expect(inferFontFormatFromUrl('font.woff2')).toBe('woff2');
  });

  it('returns "truetype" for .ttf files', () => {
    expect(inferFontFormatFromUrl('font.ttf')).toBe('truetype');
  });

  it('returns "opentype" for .otf files', () => {
    expect(inferFontFormatFromUrl('font.otf')).toBe('opentype');
  });

  it('returns "embedded-opentype" for .eot files', () => {
    expect(inferFontFormatFromUrl('font.eot')).toBe('embedded-opentype');
  });

  it('returns "svg" for .svg files', () => {
    expect(inferFontFormatFromUrl('font.svg')).toBe('svg');
  });

  it('returns null for unrecognized extensions', () => {
    expect(inferFontFormatFromUrl('font.bin')).toBeNull();
  });

  it('strips query parameters before matching', () => {
    expect(inferFontFormatFromUrl('font.woff2?v=123')).toBe('woff2');
  });

  it('is case-insensitive', () => {
    expect(inferFontFormatFromUrl('font.WOFF2')).toBe('woff2');
  });

  it('returns null for a URL with no extension', () => {
    expect(inferFontFormatFromUrl('font')).toBeNull();
  });
});
