import type { GlyphAtlas, GlyphMetrics } from '@flighthq/types';

// The horizontal kerning adjustment (pixels) between an adjacent `left`/`right` glyph pair. The
// dynamic canvas rasterizer exposes no pair kerning, so this is 0 in the first build; a native
// shaping backend or a later kerning-table source can fill it in without changing the seam.
export function getGlyphAtlasKerning(_atlas: Readonly<GlyphAtlas>, _left: number, _right: number): number {
  return 0;
}

// The atlas's shared line metrics (ascent/descent/lineGap), as the `GlyphSource` metrics. Currently
// derived from the configured font size at creation (see `deriveGlyphMetricsFromFontSize`).
export function getGlyphAtlasMetrics(atlas: Readonly<GlyphAtlas>): Readonly<GlyphMetrics> {
  return atlas.runtime.metrics;
}
