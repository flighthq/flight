import type { GlyphRasterizerBackend } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { createGlyphAtlas, getGlyphAtlasBitmap, getGlyphAtlasLayoutVersion } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';
import { setGlyphRasterizerBackend } from './glyphRasterizerBackend';
import { createGlyphSourceFromGlyphAtlas } from './glyphSource';

describe('createGlyphSourceFromGlyphAtlas', () => {
  afterEach(() => setGlyphRasterizerBackend(null));

  it('exposes the atlas as a GlyphSource that rasterizes on miss', () => {
    const backend: GlyphRasterizerBackend = {
      rasterize: () => ({
        advance: 8,
        bearingX: 1,
        bearingY: 8,
        height: 8,
        pixels: new Uint8ClampedArray(8 * 8 * 4),
        width: 8,
      }),
    };
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 20, height: 128, width: 128 });
    const source = createGlyphSourceFromGlyphAtlas(atlas);

    const entry = source.getGlyphEntry(65);
    expect(entry).not.toBeNull();
    expect(entry!.page).toBe(0);
    expect(source.getGlyphEntry(65)).toBe(getGlyphAtlasEntry(atlas, 65));
    expect(source.getGlyphKerning(65, 66)).toBe(0);
    expect(source.getGlyphMetrics()).toEqual({ ascent: 16, descent: 4, lineGap: 0 });
  });

  // The seam is what a text renderer holds; without this member it can only learn about a repack by
  // re-reading every rect it baked, which is the comparison the version exists to replace.
  it('forwards the atlas layout version, so a repack is visible through the seam alone', () => {
    const backend = createBlockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 8,
      height: 32,
      padding: 1,
      rasterizerBackend: backend,
      width: 32,
    });
    const source = createGlyphSourceFromGlyphAtlas(atlas);

    for (let codepoint = 65; codepoint < 74; codepoint++) source.getGlyphEntry(codepoint);
    expect(source.getGlyphLayoutVersion()).toBe(getGlyphAtlasLayoutVersion(atlas));
    const before = source.getGlyphLayoutVersion();

    source.getGlyphEntry(74);
    expect(source.getGlyphLayoutVersion()).toBe(getGlyphAtlasLayoutVersion(atlas));
    expect(source.getGlyphLayoutVersion()).toBeGreaterThan(before);
  });

  it('pairs page 0 with the atlas bitmap and has no other page', () => {
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 20, height: 128, width: 128 });
    const source = createGlyphSourceFromGlyphAtlas(atlas);

    expect(source.getGlyphAtlasImage(0)).toBe(getGlyphAtlasBitmap(atlas));
    expect(source.getGlyphAtlasImage()).toBe(getGlyphAtlasBitmap(atlas));
    expect(source.getGlyphAtlasImage(1)).toBeNull();
  });
});

// Every glyph an identical 8x8 block, so a 32x32 atlas holds exactly nine and the tenth forces a repack.
function createBlockRasterizerBackend(): GlyphRasterizerBackend {
  return {
    rasterize: () => ({
      advance: 8,
      bearingX: 0,
      bearingY: 8,
      height: 8,
      pixels: new Uint8ClampedArray(8 * 8 * 4),
      width: 8,
    }),
  };
}
