import type { BitmapFont, GlyphSource } from '@flighthq/types';

import { getBitmapFontGlyph, getBitmapFontKerning, getBitmapFontMetrics } from './bitmapFont';

// Adapts a `BitmapFont` into the `GlyphSource` seam a text renderer consumes, binding the font's pure
// lookups into the method object. `getGlyphEntry` is the static map lookup (no side effects) — the
// static counterpart to `@flighthq/glyphatlas`'s `createGlyphSourceFromGlyphAtlas`, whose
// `getGlyphEntry` rasterizes on miss. A renderer holds either behind the one seam without knowing which.
export function createGlyphSourceFromBitmapFont(font: Readonly<BitmapFont>): GlyphSource {
  return {
    getGlyphAtlasImage(page = 0) {
      // Each page's atlas image, indexed by the glyph's `page`. An out-of-range page (or a page whose
      // atlas carries no image yet) yields null — the renderer skips glyphs it cannot sample.
      return font.pages[page]?.image ?? null;
    },
    getGlyphEntry(codepoint) {
      return getBitmapFontGlyph(font, codepoint);
    },
    getGlyphKerning(left, right) {
      return getBitmapFontKerning(font, left, right);
    },
    getGlyphMetrics() {
      return getBitmapFontMetrics(font);
    },
  };
}
