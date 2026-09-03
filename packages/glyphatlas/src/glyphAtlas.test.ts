import type { GlyphRasterizeOptions, GlyphRasterizerBackend } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createGlyphAtlas,
  deriveGlyphMetricsFromFontSize,
  disposeGlyphAtlas,
  getGlyphAtlasBitmap,
  getGlyphAtlasLayoutVersion,
} from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';

const defaultBackend: GlyphRasterizerBackend = { rasterize: () => null };

describe('createGlyphAtlas', () => {
  it('allocates an atlas bitmap at the requested size with an empty cache', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: defaultBackend,
      width: 128,
    });
    const bitmap = getGlyphAtlasBitmap(atlas);

    expect(bitmap.width).toBe(128);
    expect(bitmap.height).toBe(64);
    expect(atlas.runtime.entries.size).toBe(0);
    expect(atlas.runtime.padding).toBe(1);
  });

  it('binds a per-atlas rasterizer independently', () => {
    const globalBackend = createMockRasterizerBackend();
    const localBackend = createMockRasterizerBackend();
    const localAtlas = createGlyphAtlas({
      fontFamily: 'embedded',
      fontSize: 16,
      height: 64,
      rasterizerBackend: localBackend.backend,
      width: 64,
    });
    const globalAtlas = createGlyphAtlas({
      fontFamily: 'system',
      fontSize: 16,
      height: 64,
      rasterizerBackend: globalBackend.backend,
      width: 64,
    });

    getGlyphAtlasEntry(localAtlas, 65);
    getGlyphAtlasEntry(globalAtlas, 66);

    expect(localBackend.calls).toEqual([65]);
    expect(globalBackend.calls).toEqual([66]);
  });
});

describe('createGlyphAtlas font style and weight', () => {
  it('forwards fontStyle and fontWeight to the rasterizer', () => {
    let seen: Readonly<GlyphRasterizeOptions> | null = null;
    const backend: GlyphRasterizerBackend = {
      rasterize: (_codepoint, options) => {
        seen = options;
        return { advance: 4, bearingX: 0, bearingY: 0, height: 4, pixels: new Uint8ClampedArray(64), width: 4 };
      },
    };
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      fontStyle: 'italic',
      fontWeight: 'bold',
      height: 64,
      rasterizerBackend: backend,
      width: 64,
    });

    getGlyphAtlasEntry(atlas, 65);

    expect(seen).not.toBeNull();
    expect(seen!.fontStyle).toBe('italic');
    expect(seen!.fontWeight).toBe('bold');
  });

  it('leaves fontStyle and fontWeight absent when not supplied', () => {
    let seen: Readonly<GlyphRasterizeOptions> | null = null;
    const backend: GlyphRasterizerBackend = {
      rasterize: (_codepoint, options) => {
        seen = options;
        return { advance: 4, bearingX: 0, bearingY: 0, height: 4, pixels: new Uint8ClampedArray(64), width: 4 };
      },
    };
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: backend,
      width: 64,
    });

    getGlyphAtlasEntry(atlas, 65);

    expect(seen).not.toBeNull();
    expect('fontStyle' in seen!).toBe(false);
    expect('fontWeight' in seen!).toBe(false);
  });
});

describe('deriveGlyphMetricsFromFontSize', () => {
  it('splits the em into ascent, descent, and zero line gap', () => {
    expect(deriveGlyphMetricsFromFontSize(10)).toEqual({ ascent: 8, descent: 2, lineGap: 0 });
  });
});

describe('disposeGlyphAtlas', () => {
  it('clears the cache so a subsequent lookup re-rasterizes', () => {
    const { backend, calls } = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 128,
      rasterizerBackend: backend,
      width: 128,
    });

    getGlyphAtlasEntry(atlas, 65);
    disposeGlyphAtlas(atlas);
    expect(atlas.runtime.entries.size).toBe(0);

    getGlyphAtlasEntry(atlas, 65);
    expect(calls).toEqual([65, 65]);
  });

  it('bumps the layout version, since every rect it handed out is now reusable space', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 128,
      rasterizerBackend: defaultBackend,
      width: 128,
    });
    const before = getGlyphAtlasLayoutVersion(atlas);
    disposeGlyphAtlas(atlas);
    expect(getGlyphAtlasLayoutVersion(atlas)).not.toBe(before);
  });
});

function createMockRasterizerBackend(): { backend: GlyphRasterizerBackend; calls: number[] } {
  const calls: number[] = [];
  const backend: GlyphRasterizerBackend = {
    rasterize(codepoint) {
      calls.push(codepoint);
      return { advance: 8, bearingX: 1, bearingY: 8, height: 8, pixels: new Uint8ClampedArray(8 * 8 * 4), width: 8 };
    },
  };
  return { backend, calls };
}

describe('getGlyphAtlasBitmap', () => {
  it('returns the atlas backing bitmap', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 32,
      rasterizerBackend: defaultBackend,
      width: 32,
    });
    expect(getGlyphAtlasBitmap(atlas)).toBe(atlas.runtime.bitmap);
  });
});

describe('getGlyphAtlasLayoutVersion', () => {
  it('does not move when a glyph is appended into free space', () => {
    const { backend } = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 128,
      rasterizerBackend: backend,
      width: 128,
    });

    const before = getGlyphAtlasLayoutVersion(atlas);
    getGlyphAtlasEntry(atlas, 65);
    getGlyphAtlasEntry(atlas, 66);
    expect(getGlyphAtlasLayoutVersion(atlas)).toBe(before);
  });

  it('is independent of the dirty region', () => {
    const { backend } = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 128,
      rasterizerBackend: backend,
      width: 128,
    });

    getGlyphAtlasEntry(atlas, 65);
    expect(atlas.runtime.dirty).toBe(true);
    expect(getGlyphAtlasLayoutVersion(atlas)).toBe(0);
  });
});
