import type { BitmapFont, GlyphSource } from '@flighthq/types';

import { getBitmapFontGlyph, getBitmapFontKerning, getBitmapFontMetrics } from './bitmapFont';

// Adapts a `BitmapFont` into the `GlyphSource` seam a text renderer consumes, binding the font's pure
// lookups into the method object. `getGlyphEntry` is the static map lookup (no side effects) — the
// static counterpart to `@flighthq/glyphatlas`'s `createGlyphSourceFromGlyphAtlas`, whose
// `getGlyphEntry` rasterizes on miss. A renderer holds either behind the one seam without knowing which.
export function createGlyphSourceFromBitmapFont(font: Readonly<BitmapFont>): GlyphSource {
  return {
    getGlyphAtlasImage(page = 0) {
      // The font's baked atlas is a single page (page 0); a multi-page font holding N page images is
      // a documented follow-up. `font.atlas` is always present, but its `image` may be null.
      return page === 0 ? font.atlas.image : null;
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
