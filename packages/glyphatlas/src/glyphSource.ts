import type { GlyphAtlas, GlyphSource } from '@flighthq/types';

import { getGlyphAtlasSurface } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';
import { getGlyphAtlasKerning, getGlyphAtlasMetrics } from './glyphAtlasMetrics';

// Adapts a `GlyphAtlas` into the `GlyphSource` seam a text renderer consumes, binding the atlas's
// free functions into the method object. `getGlyphEntry` ensures-then-returns (rasterize-on-miss),
// so a renderer drawing a string just asks for each glyph. This is the dynamic implementation of
// `GlyphSource`; `@flighthq/bitmapfont` will provide a static one of the same shape.
export function createGlyphSourceFromGlyphAtlas(atlas: Readonly<GlyphAtlas>): GlyphSource {
  return {
    getGlyphAtlasImage(page = 0) {
      // One growing surface = page 0; a `Surface` is an `ImageResource`, so this pairs the geometry
      // seam with its pixels directly.
      return page === 0 ? getGlyphAtlasSurface(atlas) : null;
    },
    getGlyphEntry(codepoint) {
      return getGlyphAtlasEntry(atlas, codepoint);
    },
    getGlyphKerning(left, right) {
      return getGlyphAtlasKerning(atlas, left, right);
    },
    getGlyphMetrics() {
      return getGlyphAtlasMetrics(atlas);
    },
  };
}
