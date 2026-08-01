import type { BitmapFont, BitmapFontGlyphExplanation } from '@flighthq/types/contract';

/** Reports why `getBitmapFontGlyph` returned null for `codepoint`, or why the glyph it returned will
 *  still draw nothing, as plain data.
 *
 *  The lookup's null sentinel covers two situations a caller resolves differently — a font that does not
 *  cover the codepoint wants a fallback font, a font with no page images wants a repaired asset — and a
 *  third the sentinel cannot report at all, because it is not null: a glyph that exists and is zero-sized.
 *  A space is the ordinary case of that, and it is the one worth naming, since "the glyph is there and
 *  draws nothing on purpose" and "the glyph is missing" look identical from a blank screen.
 *
 *  A pure read of the font's own maps: no rasterizing, no allocation beyond the returned record, and the
 *  same answer every time for a given font. Cheap enough to call per missing glyph while diagnosing. */
export function explainBitmapFontGlyph(font: Readonly<BitmapFont>, codepoint: number): BitmapFontGlyphExplanation {
  const pageCount = font.pages.length;
  const glyph = font.glyphs.get(codepoint);

  if (glyph === undefined) {
    return { glyphHeight: 0, glyphWidth: 0, page: -1, pageCount, reason: 'no-glyph', renderable: false };
  }

  const shared = { glyphHeight: glyph.height, glyphWidth: glyph.width, page: glyph.page, pageCount };

  // Checked before the size, because a font with no pages cannot draw even a well-formed glyph, and that
  // is the more actionable of the two answers.
  if (pageCount === 0) return { ...shared, reason: 'no-pages', renderable: false };
  if (glyph.width <= 0 || glyph.height <= 0) return { ...shared, reason: 'empty-glyph', renderable: false };
  return { ...shared, reason: 'ok', renderable: true };
}
