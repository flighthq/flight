import { inferFontFormat } from './fontFormat';

describe('inferFontFormat', () => {
  it('returns "woff" for .woff files', () => {
    expect(inferFontFormat('font.woff')).toBe('woff');
  });

  it('returns "woff2" for .woff2 files', () => {
    expect(inferFontFormat('font.woff2')).toBe('woff2');
  });

  it('returns "truetype" for .ttf files', () => {
    expect(inferFontFormat('font.ttf')).toBe('truetype');
  });

  it('returns "opentype" for .otf files', () => {
    expect(inferFontFormat('font.otf')).toBe('opentype');
  });

  it('returns "embedded-opentype" for .eot files', () => {
    expect(inferFontFormat('font.eot')).toBe('embedded-opentype');
  });

  it('returns "svg" for .svg files', () => {
    expect(inferFontFormat('font.svg')).toBe('svg');
  });

  it('returns null for unrecognized extensions', () => {
    expect(inferFontFormat('font.bin')).toBeNull();
  });

  it('strips query parameters before matching', () => {
    expect(inferFontFormat('font.woff2?v=123')).toBe('woff2');
  });

  it('is case-insensitive', () => {
    expect(inferFontFormat('font.WOFF2')).toBe('woff2');
  });

  it('returns null for a URL with no extension', () => {
    expect(inferFontFormat('font')).toBeNull();
  });
});
