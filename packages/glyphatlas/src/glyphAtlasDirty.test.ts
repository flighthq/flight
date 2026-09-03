import type { GlyphRasterizerBackend } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createGlyphAtlas } from './glyphAtlas';
import { clearGlyphAtlasDirty, getGlyphAtlasDirtyRegion } from './glyphAtlasDirty';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';

const defaultBackend: GlyphRasterizerBackend = { rasterize: () => null };

describe('clearGlyphAtlasDirty', () => {
  it('resets the dirty region to null', () => {
    const backend = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 128,
      rasterizerBackend: backend,
      width: 128,
    });

    getGlyphAtlasEntry(atlas, 65);
    expect(getGlyphAtlasDirtyRegion(atlas)).not.toBeNull();

    clearGlyphAtlasDirty(atlas);
    expect(getGlyphAtlasDirtyRegion(atlas)).toBeNull();
  });
});

describe('getGlyphAtlasDirtyRegion', () => {
  it('is null on a fresh atlas', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 128,
      rasterizerBackend: defaultBackend,
      width: 128,
    });
    expect(getGlyphAtlasDirtyRegion(atlas)).toBeNull();
  });

  it('covers a newly added glyph rect', () => {
    const backend = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 128,
      rasterizerBackend: backend,
      width: 128,
    });

    const entry = getGlyphAtlasEntry(atlas, 65)!;
    const region = getGlyphAtlasDirtyRegion(atlas)!;

    expect(region.x).toBe(entry.x);
    expect(region.y).toBe(entry.y);
    expect(region.width).toBe(entry.width);
    expect(region.height).toBe(entry.height);
  });

  it('re-dirties only the new rect after a clear', () => {
    const backend = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 128,
      rasterizerBackend: backend,
      width: 128,
    });

    getGlyphAtlasEntry(atlas, 65);
    clearGlyphAtlasDirty(atlas);
    const entry = getGlyphAtlasEntry(atlas, 66)!;
    const region = getGlyphAtlasDirtyRegion(atlas)!;

    expect(region.x).toBe(entry.x);
    expect(region.y).toBe(entry.y);
    expect(region.width).toBe(entry.width);
    expect(region.height).toBe(entry.height);
  });
});

function createMockRasterizerBackend(): GlyphRasterizerBackend {
  return {
    rasterize(codepoint) {
      const size = 8 + (codepoint % 4);
      return {
        advance: size,
        bearingX: 1,
        bearingY: size,
        height: size,
        pixels: new Uint8ClampedArray(size * size * 4),
        width: size,
      };
    },
  };
}
