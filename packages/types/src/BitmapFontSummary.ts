// A bitmap font's size and coverage at a glance, as plain data. Fonts are the largest fixed asset in a
// text-heavy scene and their cost is invisible from the outside: a font that covers CJK carries hundreds
// of times the glyphs of a Latin one through the same API surface. This is what a budget check, a build
// report, or a debug overlay reads.
export interface BitmapFontSummary {
  glyphCount: number;
  kerningPairCount: number;
  pageCount: number;
  // The CPU-side byte footprint of every page image, summed. A page whose texture is unbound or has been
  // uploaded and released contributes nothing, so this is a LOWER BOUND on a font that has not finished
  // loading rather than an estimate of what it will become — `pageCount` is what reveals the difference.
  byteSize: number;
  // The lowest and highest codepoint the font carries, or -1 for both when it carries no glyphs. A
  // range, not a coverage set: a font can be sparse within it.
  minCodepoint: number;
  maxCodepoint: number;
}
