// Why `getBitmapFontGlyph` returned null, or why a glyph it returned will still draw nothing. The
// lookup's null sentinel covers genuinely different situations whose remedies differ — a font that does
// not cover the codepoint wants a fallback font, a font with no pages wants a repaired asset — and a
// sentinel cannot carry that distinction. This is the pull-style answer, returned as plain data so the
// query stays free of message strings; `enableBitmapFontGuards` is the push-style counterpart.
export interface BitmapFontGlyphExplanation {
  // Whether the glyph will actually put pixels on screen. False for every reason except `ok`.
  renderable: boolean;
  reason: BitmapFontGlyphExplanationReason;
  // The page the glyph resolved to, and how many the font carries. `page` is -1 when there is no glyph.
  page: number;
  pageCount: number;
  // The glyph's atlas rectangle size, both 0 when there is no glyph.
  glyphWidth: number;
  glyphHeight: number;
}

// `ok` — the glyph exists, its page exists, and it has area.
// `no-glyph` — the font carries no entry for this codepoint.
// `no-pages` — the glyph exists but the font has no page images, so there is nothing to sample.
// `empty-glyph` — the glyph exists and is zero-sized: a space or a control character, which advances
//   the pen and draws nothing. Deliberately not an error; it is reported so a caller hunting a missing
//   glyph can tell "drew nothing on purpose" from "drew nothing by mistake".
export type BitmapFontGlyphExplanationReason = 'empty-glyph' | 'no-glyph' | 'no-pages' | 'ok';
