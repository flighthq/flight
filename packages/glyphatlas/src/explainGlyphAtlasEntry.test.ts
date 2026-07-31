import type { GlyphRasterizerBackend } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { explainGlyphAtlasEntry } from './explainGlyphAtlasEntry';
import { createGlyphAtlas } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';
import { setGlyphRasterizerBackend } from './glyphRasterizerBackend';

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

describe('explainGlyphAtlasEntry', () => {
  afterEach(() => setGlyphRasterizerBackend(null));

  it('reports ok with the measured sizes for a glyph that fits', () => {
    setGlyphRasterizerBackend(backendProducing(8, 8));
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 64, width: 64 });

    const explanation = explainGlyphAtlasEntry(atlas, 65);

    expect(explanation.renderable).toBe(true);
    expect(explanation.reason).toBe('ok');
    expect(explanation.glyphWidth).toBe(8);
    expect(explanation.usableWidth).toBe(62);
  });

  // The two null paths are genuinely different problems with different remedies, which is the whole
  // reason this query exists: the sentinel cannot tell them apart.
  it('distinguishes a rasterizer that produced nothing', () => {
    setGlyphRasterizerBackend({ rasterize: () => null });
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 64, width: 64 });

    const explanation = explainGlyphAtlasEntry(atlas, 65);

    expect(explanation.renderable).toBe(false);
    expect(explanation.reason).toBe('rasterizer-returned-null');
  });

  it('distinguishes a glyph larger than the atlas, and reports how much larger', () => {
    setGlyphRasterizerBackend(backendProducing(200, 8));
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 64, width: 64 });

    const explanation = explainGlyphAtlasEntry(atlas, 65);

    expect(explanation.renderable).toBe(false);
    expect(explanation.reason).toBe('glyph-larger-than-atlas');
    expect(explanation.glyphWidth).toBe(200);
    expect(explanation.usableWidth).toBe(62);
  });

  it('reports a cached glyph as ok without re-measuring it', () => {
    setGlyphRasterizerBackend(backendProducing(8, 8));
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 64, width: 64 });
    getGlyphAtlasEntry(atlas, 65);

    const rasterize = vi.fn(() => null);
    setGlyphRasterizerBackend({ rasterize });

    expect(explainGlyphAtlasEntry(atlas, 65).reason).toBe('ok');
    expect(rasterize).not.toHaveBeenCalled();
  });
});
