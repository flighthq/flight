import { getTextureAtlasByteSize } from '@flighthq/textureatlas/contract';
import type { BitmapFont, BitmapFontSummary } from '@flighthq/types/contract';

/** Summarizes a font's size and coverage as plain data: glyph and kerning-pair counts, page count, the
 *  CPU-side bytes its page images occupy, and the codepoint range.
 *
 *  Fonts are the largest fixed asset in a text-heavy scene and their cost is invisible from the API: a
 *  CJK-covering font carries hundreds of times the glyphs of a Latin one through exactly the same
 *  surface. This is what a budget check, a build report, or a debug overlay reads.
 *
 *  The byte figure comes from `getTextureAtlasByteSize` rather than from width times height, which
 *  matters for two reasons: a compressed page costs its payload rather than four bytes per pixel, and a
 *  page that is unbound or already uploaded-and-released costs nothing. That makes `byteSize` a LOWER
 *  BOUND on a font mid-load rather than an estimate; `pageCount` is what shows the gap. */
export function summarizeBitmapFont(font: Readonly<BitmapFont>): BitmapFontSummary {
  let byteSize = 0;
  for (const page of font.pages) byteSize += getTextureAtlasByteSize(page);

  let minCodepoint = -1;
  let maxCodepoint = -1;
  for (const codepoint of font.glyphs.keys()) {
    if (minCodepoint < 0 || codepoint < minCodepoint) minCodepoint = codepoint;
    if (codepoint > maxCodepoint) maxCodepoint = codepoint;
  }

  return {
    byteSize,
    glyphCount: font.glyphs.size,
    kerningPairCount: font.kerning.size,
    maxCodepoint,
    minCodepoint,
    pageCount: font.pages.length,
  };
}
