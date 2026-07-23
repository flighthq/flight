import {
  getBitmapFontGlyph,
  getBitmapFontKerning,
  getBitmapFontMetrics,
  getBitmapFontPage,
} from '@flighthq/bitmapfont';
import { createTextureAtlas } from '@flighthq/textureatlas';
import type { BitmapFontRecord } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { buildBitmapFontFromRecord } from './bitmapFontRecord';

describe('buildBitmapFontFromRecord', () => {
  it('maps chars, kernings, and common metrics onto a BitmapFont', () => {
    const atlas = createTextureAtlas();
    const font = buildBitmapFontFromRecord(sampleRecord(), { resolvePage: () => atlas });
    expect(font).not.toBeNull();

    expect(getBitmapFontPage(font!, 0)).toBe(atlas);
    // yoffset=5 with base=26 → bearingY = base - yoffset = 21 (baseline-relative, up-positive).
    expect(getBitmapFontGlyph(font!, 65)).toEqual({
      advance: 9,
      bearingX: 1,
      bearingY: 21,
      height: 8,
      page: 0,
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

  it('resolves every declared page and carries each char page onto its glyph', () => {
    const page0 = createTextureAtlas();
    const page1 = createTextureAtlas();
    const font = buildBitmapFontFromRecord(multiPageRecord(), {
      resolvePage: (id) => (id === 0 ? page0 : page1),
    });
    expect(font).not.toBeNull();

    expect(font!.pages).toEqual([page0, page1]);
    expect(getBitmapFontPage(font!, 0)).toBe(page0);
    expect(getBitmapFontPage(font!, 1)).toBe(page1);
    expect(getBitmapFontGlyph(font!, 65)!.page).toBe(0);
    expect(getBitmapFontGlyph(font!, 86)!.page).toBe(1);
  });

  it('tolerates an unreferenced page that fails to resolve', () => {
    // Two pages declared, but every glyph samples page 0; page 1 (unreferenced) fails to resolve.
    const page0 = createTextureAtlas();
    const font = buildBitmapFontFromRecord(
      {
        ...sampleRecord(),
        pages: [
          { file: 'a.png', id: 0 },
          { file: 'b.png', id: 1 },
        ],
      },
      { resolvePage: (id) => (id === 0 ? page0 : null) },
    );
    expect(font).not.toBeNull();
    expect(getBitmapFontPage(font!, 0)).toBe(page0);
  });

  it('returns null when a referenced page fails to resolve', () => {
    // Glyph 86 samples page 1, which resolves null → the parse collapses.
    expect(
      buildBitmapFontFromRecord(multiPageRecord(), { resolvePage: (id) => (id === 0 ? createTextureAtlas() : null) }),
    ).toBeNull();
  });

  it('returns null when resolvePage is absent, missing, or returns null for the page', () => {
    expect(buildBitmapFontFromRecord(sampleRecord())).toBeNull();
    expect(buildBitmapFontFromRecord(sampleRecord(), { resolvePage: () => null })).toBeNull();
    expect(
      buildBitmapFontFromRecord({ ...sampleRecord(), pages: [] }, { resolvePage: () => createTextureAtlas() }),
    ).toBeNull();
  });
});

function multiPageRecord(): BitmapFontRecord {
  return {
    base: 26,
    chars: [
      { height: 8, id: 65, page: 0, width: 7, x: 0, xadvance: 9, xoffset: 1, y: 0, yoffset: 0 },
      { height: 8, id: 86, page: 1, width: 6, x: 8, xadvance: 8, xoffset: 0, y: 0, yoffset: 0 },
    ],
    encoding: 'raster',
    kernings: [],
    lineHeight: 32,
    pages: [
      { file: 'test_0.png', id: 0 },
      { file: 'test_1.png', id: 1 },
    ],
  };
}

function sampleRecord(): BitmapFontRecord {
  return {
    base: 26,
    chars: [
      { height: 8, id: 65, page: 0, width: 7, x: 0, xadvance: 9, xoffset: 1, y: 0, yoffset: 5 },
      { height: 8, id: 86, page: 0, width: 6, x: 8, xadvance: 8, xoffset: 0, y: 0, yoffset: 0 },
    ],
    encoding: 'raster',
    kernings: [{ amount: -2, first: 65, second: 86 }],
    lineHeight: 32,
    pages: [{ file: 'test_0.png', id: 0 }],
  };
}
