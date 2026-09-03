import { createEntity } from '@flighthq/entity/contract';
import type { BitmapFont, Entity, GlyphSource } from '@flighthq/types/contract';

import { getBitmapFontGlyph, getBitmapFontKerning, getBitmapFontMetrics } from './bitmapFont';

// Adapts a `BitmapFont` into the `GlyphSource` seam a text renderer consumes, binding the font's pure
// lookups into the method object. `getGlyphEntry` is the static map lookup (no side effects) — the
// static counterpart to `@flighthq/glyphatlas`'s `createGlyphSourceFromGlyphAtlas`, whose
// `getGlyphEntry` rasterizes on miss. A renderer holds either behind the one seam without knowing which.
export function createGlyphSourceFromBitmapFont(font: Readonly<BitmapFont>): GlyphSource & Entity {
  return createEntity({
    getGlyphAtlasImage(page = 0) {
      // Each page's atlas image, indexed by the glyph's `page`. An out-of-range page (or a page whose
      // atlas carries no image yet) yields null — the renderer skips glyphs it cannot sample.
      const texture = font.pages[page]?.texture;
      return texture?.dimension === '2d' ? texture.source : null;
    },
    getGlyphEntry(codepoint) {
      return getBitmapFontGlyph(font, codepoint);
    },
    getGlyphKerning(left, right) {
      return getBitmapFontKerning(font, left, right);
    },
    getGlyphLayoutVersion() {
      // A pre-baked font never relocates a glyph — its pages are authored, not packed at runtime — so
      // the placement revision is a constant and a consumer that bakes these rects never re-bakes.
      // This is the whole reason the seam reports a number rather than the consumer polling rects.
      return 0;
    },
    getGlyphMetrics() {
      return getBitmapFontMetrics(font);
    },
  });
}
