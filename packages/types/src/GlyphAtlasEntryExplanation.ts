// Plain-data answer to "why did getGlyphAtlasEntry return null?", the pull half of the diagnostics
// convention for the glyph cache. Recomputed on demand against the same seams the lookup uses, holding
// no reference to the atlas. Format for humans in a separate format* companion, never here.
export interface GlyphAtlasEntryExplanation {
  // The glyph can be produced. When false, getGlyphAtlasEntry returns null for `reason`.
  readonly renderable: boolean;
  readonly reason: GlyphAtlasEntryBlockReason;
  // The rasterized glyph's size and the atlas area it must fit inside, in pixels. Present for every
  // reason so a caller can see how far over it was, rather than only being told that it did not fit.
  // Zero when the rasterizer produced nothing to measure.
  readonly glyphWidth: number;
  readonly glyphHeight: number;
  readonly usableWidth: number;
  readonly usableHeight: number;
}

// `ok` — the glyph rasterizes and fits.
// `rasterizer-returned-null` — the active rasterizer could not produce this codepoint: no canvas in the
//   host, a font that has no such glyph, or a backend that declined. A capability of the environment or
//   the font, not of the atlas.
// `glyph-larger-than-atlas` — the glyph rasterized, but it is bigger than the atlas's usable area, so no
//   amount of eviction can make room. Distinguished from a full cache, which is transient.
export type GlyphAtlasEntryBlockReason = 'glyph-larger-than-atlas' | 'ok' | 'rasterizer-returned-null';
