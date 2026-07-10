import { describe, expect, it } from 'vitest';

import { formatTiledColor, parseTiledColor } from './tiledColor';

describe('formatTiledColor', () => {
  it('emits #AARRGGBB with alpha first', () => {
    expect(formatTiledColor(0xff8800ff)).toBe('#ffff8800');
    expect(formatTiledColor(0x00ff0080)).toBe('#8000ff00');
  });

  it('round-trips with parseTiledColor', () => {
    const packed = parseTiledColor('#8000ff00');
    expect(packed).not.toBeNull();
    expect(parseTiledColor(formatTiledColor(packed!))).toBe(packed);
  });
});

describe('parseTiledColor', () => {
  it('parses a 6-digit color as opaque RGBA', () => {
    expect(parseTiledColor('#ff8800')).toBe(0xff8800ff);
    expect(parseTiledColor('ff8800')).toBe(0xff8800ff);
  });

  it('parses an 8-digit AARRGGBB color into packed RGBA', () => {
    expect(parseTiledColor('#8000ff00')).toBe(0x00ff0080);
  });

  it('returns null for a malformed color', () => {
    expect(parseTiledColor('#12345')).toBeNull();
    expect(parseTiledColor('#nothex')).toBeNull();
  });
});
