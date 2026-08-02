import type { Path } from './Path';

// Font-wide vertical metrics in the same design-unit coordinate space as a GlyphOutlineSource.
// `unitsPerEm` is the scale denominator: rendering at N pixels per em multiplies every outline,
// advance, and metric by N / unitsPerEm. Ascent and descent are positive distances from the baseline;
// path y coordinates increase downward, so ink above the baseline has negative y coordinates.
export interface GlyphOutlineMetrics {
  ascent: number;
  descent: number;
  lineGap: number;
  unitsPerEm: number;
}

// An index-keyed vector-font seam. A pre-shaped format naturally owns glyph indices rather than
// Unicode-keyed raster images, so codepoint lookup is an explicit map and missing codepoints return
// -1. `getGlyphOutline` replaces `out` with one glyph's baseline-relative path in design units and
// returns false for an unknown index. Empty-but-present glyphs (for example a space) return true with
// an empty path so their advance remains observable.
//
// This is a bound method object because a parser-produced font owns its outline/codepoint tables. It
// is a sibling of the codepoint-keyed GlyphSource raster seam, not a subtype of it; callers compose an
// outline source into either vector paths or a GlyphRasterizerBackend explicitly.
export interface GlyphOutlineSource {
  getGlyphOutline(out: Path, glyphIndex: number): boolean;
  getGlyphOutlineAdvance(glyphIndex: number): number;
  getGlyphOutlineIndexForCodePoint(codePoint: number): number;
  getGlyphOutlineMetrics(): Readonly<GlyphOutlineMetrics>;
}
