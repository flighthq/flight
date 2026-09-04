import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { GlyphAtlas, GlyphSource, EntityConstruction } from '@flighthq/types/contract';

import { getGlyphAtlasBitmap, getGlyphAtlasLayoutVersion } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';
import { getGlyphAtlasKerning, getGlyphAtlasMetrics } from './glyphAtlasMetrics';

export function createGlyphSourceFromGlyphAtlas(atlas: Readonly<GlyphAtlas>): GlyphSource {
  const out = allocateEntity<GlyphSource>();
  initializeGlyphSourceFromGlyphAtlas(out, atlas);
  return finishEntity(out);
}

// Adapts a `GlyphAtlas` into the `GlyphSource` seam a text renderer consumes, binding the atlas's
// free functions into the method object. `getGlyphEntry` ensures-then-returns (rasterize-on-miss),
// so a renderer drawing a string just asks for each glyph. This is the dynamic implementation of
// `GlyphSource`; `@flighthq/bitmapfont` will provide a static one of the same shape.
export function initializeGlyphSourceFromGlyphAtlas(
  out: EntityConstruction<GlyphSource>,
  atlas: Readonly<GlyphAtlas>,
): void {
  out.getGlyphAtlasImage = (page = 0) => {
    // One growing bitmap = page 0; a `Bitmap` is an `Image`, so this pairs the geometry
    // seam with its pixels directly.
    return page === 0 ? getGlyphAtlasBitmap(atlas) : null;
  };
  out.getGlyphEntry = (codepoint) => {
    return getGlyphAtlasEntry(atlas, codepoint);
  };
  out.getGlyphKerning = (left, right) => {
    return getGlyphAtlasKerning(atlas, left, right);
  };
  out.getGlyphLayoutVersion = () => {
    return getGlyphAtlasLayoutVersion(atlas);
  };
  out.getGlyphMetrics = () => {
    return getGlyphAtlasMetrics(atlas);
  };
}
