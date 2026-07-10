import { getBitmapFontGlyph, getBitmapFontKerning, getBitmapFontMetrics } from '@flighthq/bitmapfont';
import { createTextureAtlas } from '@flighthq/textureatlas';
import { describe, expect, it } from 'vitest';

import { buildBitmapFontFromRecord } from './bitmapFontRecord';
import type { BitmapFontRecord } from './bitmapFontRecord';

describe('buildBitmapFontFromRecord', () => {
  it('maps chars, kernings, and common metrics onto a BitmapFont', () => {
    const atlas = createTextureAtlas();
    const font = buildBitmapFontFromRecord(sampleRecord(), { resolvePage: () => atlas });
    expect(font).not.toBeNull();

    expect(font!.atlas).toBe(atlas);
    expect(getBitmapFontGlyph(font!, 65)).toEqual({
      advance: 9,
      bearingX: 1,
      bearingY: 0,
      height: 8,
      width: 7,
      x: 0,
      y: 0,
    });
    expect(getBitmapFontKerning(font!, 65, 86)).toBe(-2);
    // base=26, lineHeight=32 → ascent=26, descent=6, lineGap=0.
    expect(getBitmapFontMetrics(font!)).toEqual({ ascent: 26, descent: 6, lineGap: 0 });
  });

  it('carries the record encoding onto the font', () => {
    const font = buildBitmapFontFromRecord(
      { ...sampleRecord(), encoding: 'sdf' },
      { resolvePage: () => createTextureAtlas() },
    );
    expect(font!.encoding).toBe('sdf');
  });

  it('returns null when resolvePage is absent, missing, or returns null for the page', () => {
    expect(buildBitmapFontFromRecord(sampleRecord())).toBeNull();
    expect(buildBitmapFontFromRecord(sampleRecord(), { resolvePage: () => null })).toBeNull();
    expect(
      buildBitmapFontFromRecord({ ...sampleRecord(), pages: [] }, { resolvePage: () => createTextureAtlas() }),
    ).toBeNull();
  });
});

function sampleRecord(): BitmapFontRecord {
  return {
    base: 26,
    chars: [
      { height: 8, id: 65, width: 7, x: 0, xadvance: 9, xoffset: 1, y: 0, yoffset: 0 },
      { height: 8, id: 86, width: 6, x: 8, xadvance: 8, xoffset: 0, y: 0, yoffset: 0 },
    ],
    encoding: 'raster',
    kernings: [{ amount: -2, first: 65, second: 86 }],
    lineHeight: 32,
    pages: [{ file: 'test_0.png', id: 0 }],
  };
}
