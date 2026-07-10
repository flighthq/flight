import type { BitmapFont, BitmapFontData, GlyphEntry, GlyphMetrics, TextureAtlas } from '@flighthq/types';

// Builds an immutable static bitmap font from plain data: the glyph list becomes a
// `codepoint → GlyphEntry` map, the kerning pairs become a `(left << 16) | right → amount` map, and
// the atlas reference, line metrics, and encoding (default `raster`) are carried as-is. Nothing
// mutates the font after this call — it is the static counterpart to the growing `@flighthq/glyphatlas`.
export function createBitmapFont(data: Readonly<BitmapFontData>): BitmapFont {
  const glyphs = new Map<number, GlyphEntry>();
  for (const glyph of data.glyphs) {
    glyphs.set(glyph.codepoint, {
      advance: glyph.advance,
      bearingX: glyph.bearingX,
      bearingY: glyph.bearingY,
      height: glyph.height,
      page: 0, // Single-page for now — a multi-page font (N page images) is a documented follow-up.
      width: glyph.width,
      x: glyph.x,
      y: glyph.y,
    });
  }
  const kerning = new Map<number, number>();
  if (data.kerning !== undefined) {
    for (const pair of data.kerning) {
      kerning.set(packBitmapFontKerningKey(pair.left, pair.right), pair.amount);
    }
  }
  return {
    atlas: data.atlas,
    encoding: data.encoding ?? 'raster',
    glyphs,
    kerning,
    metrics: {
      ascent: data.metrics.ascent,
      descent: data.metrics.descent,
      lineGap: data.metrics.lineGap,
    },
  };
}

// The texture atlas the font's glyph rectangles index into — the pixels a renderer uploads and
// samples. Immutable: the font shares this reference, it does not clone the atlas.
export function getBitmapFontAtlas(font: Readonly<BitmapFont>): TextureAtlas {
  return font.atlas;
}

// The glyph entry (atlas rectangle + advance + bearing) for a codepoint, or `null` when the font
// carries no glyph for it. A pure map lookup — the static counterpart to glyphatlas's rasterize-on-miss.
export function getBitmapFontGlyph(font: Readonly<BitmapFont>, codepoint: number): GlyphEntry | null {
  return font.glyphs.get(codepoint) ?? null;
}

// The horizontal kerning adjustment (pixels) between an adjacent `left`/`right` glyph pair, or 0 when
// the font carries no entry for the pair.
export function getBitmapFontKerning(font: Readonly<BitmapFont>, left: number, right: number): number {
  return font.kerning.get(packBitmapFontKerningKey(left, right)) ?? 0;
}

// The font's shared line metrics (ascent/descent/lineGap), in pixels at the baked glyph size.
export function getBitmapFontMetrics(font: Readonly<BitmapFont>): Readonly<GlyphMetrics> {
  return font.metrics;
}

// Packs an adjacent glyph pair into the single-number kerning-map key `(left << 16) | right`. Both
// codepoints are assumed to lie in the Basic Multilingual Plane (< 0x10000); supplementary-plane
// pairs are outside this table's addressable range.
function packBitmapFontKerningKey(left: number, right: number): number {
  return (left << 16) | right;
}
