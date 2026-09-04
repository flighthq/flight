import { appendPathClose, appendPathLineTo, appendPathMoveTo } from '@flighthq/path/contract';
import type { GlyphOutlineSource, Path } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createGlyphRasterizerBackendFromGlyphOutlineSource,
  initializeGlyphRasterizerBackendFromGlyphOutlineSource,
} from './glyphOutlineSource';

describe('createGlyphRasterizerBackendFromGlyphOutlineSource', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createGlyphRasterizerBackendFromGlyphOutlineSource(createTestGlyphOutlineSource())).toBe(
      true,
    );
  });

  it('maps codepoints to glyph indices and rasterizes design-unit outlines at the requested em size', () => {
    const backend = createGlyphRasterizerBackendFromGlyphOutlineSource(createTestGlyphOutlineSource());
    const raster = backend.rasterize(0x41, { fontFamily: 'embedded', fontSize: 20 });

    expect(raster).not.toBeNull();
    expect(raster!.advance).toBe(12);
    expect(raster!.bearingX).toBe(-3);
    expect(raster!.bearingY).toBe(17);
    expect(raster!.width).toBe(14);
    expect(raster!.height).toBe(22);
    expect(raster!.pixels.some((value, index) => index % 4 === 3 && value === 0xff)).toBe(true);
    expect(raster!.pixels[3]).toBe(0);
  });

  it('returns scaled outline metrics to glyphatlas', () => {
    const backend = createGlyphRasterizerBackendFromGlyphOutlineSource(createTestGlyphOutlineSource());

    expect(backend.measureMetrics?.({ fontFamily: 'embedded', fontSize: 20 })).toEqual({
      ascent: 16,
      descent: 4,
      lineGap: 2,
    });
  });

  it('returns a zero-area raster with an advance for an empty glyph', () => {
    const backend = createGlyphRasterizerBackendFromGlyphOutlineSource(createTestGlyphOutlineSource());

    expect(backend.rasterize(0x20, { fontFamily: 'embedded', fontSize: 20 })).toEqual({
      advance: 5,
      bearingX: 0,
      bearingY: 0,
      height: 0,
      pixels: new Uint8ClampedArray(),
      width: 0,
    });
  });

  it('sentinels for an unmapped codepoint or invalid em scale', () => {
    const backend = createGlyphRasterizerBackendFromGlyphOutlineSource(createTestGlyphOutlineSource());

    expect(backend.rasterize(0x42, { fontFamily: 'embedded', fontSize: 20 })).toBeNull();
    expect(backend.rasterize(0x41, { fontFamily: 'embedded', fontSize: 0 })).toBeNull();
  });
});

function createTestGlyphOutlineSource(): GlyphOutlineSource {
  return {
    getGlyphOutline(out: Path, glyphIndex: number): boolean {
      out.commands.length = 0;
      out.data.length = 0;
      out.winding = 'nonZero';
      if (glyphIndex === 1) return true;
      if (glyphIndex !== 0) return false;
      appendPathMoveTo(out, -100, -800);
      appendPathLineTo(out, 500, -800);
      appendPathLineTo(out, 500, 200);
      appendPathLineTo(out, -100, 200);
      appendPathClose(out);
      return true;
    },
    getGlyphOutlineAdvance(glyphIndex: number): number {
      return glyphIndex === 1 ? 250 : 600;
    },
    getGlyphOutlineIndexForCodePoint(codePoint: number): number {
      if (codePoint === 0x41) return 0;
      if (codePoint === 0x20) return 1;
      return -1;
    },
    getGlyphOutlineMetrics() {
      return { ascent: 800, descent: 200, lineGap: 100, unitsPerEm: 1000 };
    },
  };
}
describe('initializeGlyphRasterizerBackendFromGlyphOutlineSource', () => {
  it('is the construction initializer of createGlyphRasterizerBackendFromGlyphOutlineSource', () => {
    expect(typeof initializeGlyphRasterizerBackendFromGlyphOutlineSource).toBe('function');
  });
});
