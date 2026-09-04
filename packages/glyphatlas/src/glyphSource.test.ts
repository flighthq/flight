import type { GlyphRasterizerBackend } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createGlyphAtlas, getGlyphAtlasBitmap, getGlyphAtlasLayoutVersion } from './glyphAtlas';
import { createGlyphSourceFromGlyphAtlas, initializeGlyphSourceFromGlyphAtlas } from './glyphSource';

const defaultBackend: GlyphRasterizerBackend = { rasterize: () => null };

describe('createGlyphSourceFromGlyphAtlas', () => {
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
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 20,
      height: 128,
      rasterizerBackend: backend,
      width: 128,
    });
    const source = createGlyphSourceFromGlyphAtlas(atlas);

    const entry = source.getGlyphEntry(65);
    expect(entry).not.toBeNull();
    expect(entry!.page).toBe(0);
    expect(source.getGlyphEntry(65)).toBe(source.getGlyphEntry(65));
    expect(source.getGlyphKerning(65, 66)).toBe(0);
    expect(source.getGlyphMetrics()).toEqual({ ascent: 16, descent: 4, lineGap: 0 });
  });

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
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 20,
      height: 128,
      rasterizerBackend: defaultBackend,
      width: 128,
    });
    const source = createGlyphSourceFromGlyphAtlas(atlas);

    expect(source.getGlyphAtlasImage(0)).toBe(getGlyphAtlasBitmap(atlas));
    expect(source.getGlyphAtlasImage()).toBe(getGlyphAtlasBitmap(atlas));
    expect(source.getGlyphAtlasImage(1)).toBeNull();
  });
});

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
describe('initializeGlyphSourceFromGlyphAtlas', () => {
  it('is the construction initializer of createGlyphSourceFromGlyphAtlas', () => {
    expect(typeof initializeGlyphSourceFromGlyphAtlas).toBe('function');
  });
});
