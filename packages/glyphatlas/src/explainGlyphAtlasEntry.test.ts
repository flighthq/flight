import type { GlyphRasterizerBackend } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { explainGlyphAtlasEntry } from './explainGlyphAtlasEntry';
import { createGlyphAtlas } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';

function backendProducing(width: number, height: number): GlyphRasterizerBackend {
  return {
    rasterize: () => ({
      advance: width,
      bearingX: 0,
      bearingY: 0,
      height,
      pixels: new Uint8ClampedArray(width * height * 4),
      width,
    }),
  };
}

function red4pxBackend(): GlyphRasterizerBackend {
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set([255, 0, 0, 255], offset);
  return {
    rasterize: () => ({ advance: 4, bearingX: 0, bearingY: 0, height: 4, pixels, width: 4 }),
  };
}

describe('explainGlyphAtlasEntry', () => {
  it('reports ok with the measured sizes for a glyph that fits', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: backendProducing(8, 8),
      width: 64,
    });

    const explanation = explainGlyphAtlasEntry(atlas, 65);

    expect(explanation.renderable).toBe(true);
    expect(explanation.reason).toBe('ok');
    expect(explanation.glyphWidth).toBe(8);
    expect(explanation.usableWidth).toBe(62);
  });

  it('agrees with a real entry produced by the backend pinned to another equivalent atlas', () => {
    const rasterizerBackend = red4pxBackend();
    const options = {
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend,
      width: 64,
    } as const;
    const subjectAtlas = createGlyphAtlas(options);
    const explanationAtlas = createGlyphAtlas(options);

    const entry = getGlyphAtlasEntry(subjectAtlas, 65);
    expect(entry).not.toBeNull();
    expect(entry?.width).toBe(4);
    const firstPixelOffset = 4 * (entry!.y * subjectAtlas.runtime.bitmap.width + entry!.x);
    expect(subjectAtlas.runtime.bitmap.data.slice(firstPixelOffset, firstPixelOffset + 4)).toEqual(
      new Uint8ClampedArray([255, 0, 0, 255]),
    );

    expect(explainGlyphAtlasEntry(explanationAtlas, 65)).toEqual({
      glyphHeight: entry?.height,
      glyphWidth: entry?.width,
      reason: 'ok',
      renderable: true,
      usableHeight: 62,
      usableWidth: 62,
    });
  });

  it('distinguishes a rasterizer that produced nothing', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: { rasterize: () => null },
      width: 64,
    });

    const explanation = explainGlyphAtlasEntry(atlas, 65);

    expect(explanation.renderable).toBe(false);
    expect(explanation.reason).toBe('rasterizer-returned-null');
  });

  it('distinguishes a glyph larger than the atlas, and reports how much larger', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: backendProducing(200, 8),
      width: 64,
    });

    const explanation = explainGlyphAtlasEntry(atlas, 65);

    expect(explanation.renderable).toBe(false);
    expect(explanation.reason).toBe('glyph-larger-than-atlas');
    expect(explanation.glyphWidth).toBe(200);
    expect(explanation.usableWidth).toBe(62);
  });

  it('reports a cached glyph as ok without re-measuring it', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: backendProducing(8, 8),
      width: 64,
    });
    getGlyphAtlasEntry(atlas, 65);

    const rasterize = vi.fn(() => null);
    atlas.runtime.rasterizerBackend = { rasterize };

    expect(explainGlyphAtlasEntry(atlas, 65).reason).toBe('ok');
    expect(rasterize).not.toHaveBeenCalled();
  });
});
