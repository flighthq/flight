import type { BitmapFont, BitmapFontData, GlyphEntry, GlyphMetrics, TextureAtlas } from '@flighthq/types';

// Builds an immutable static bitmap font from plain data: the glyph list becomes a
// `codepoint → GlyphEntry` map, the kerning pairs become a `(left << 16) | right → amount` map, and
// the page-indexed atlas list, line metrics, and encoding (default `raster`) are carried as-is. Each
// glyph's `page` (default 0) indexes `data.pages`; an out-of-range page is clamped to 0 so the glyph
// is still placed (on the primary page) rather than dropped — a bad page index is a source-data
// defect the font should survive, not a reason to lose a glyph. Nothing mutates the font after this
// call — it is the static counterpart to the growing `@flighthq/glyphatlas`.
export function createBitmapFont(data: Readonly<BitmapFontData>): BitmapFont {
  const pageCount = data.pages.length;
  const glyphs = new Map<number, GlyphEntry>();
  for (const glyph of data.glyphs) {
    const page = glyph.page ?? 0;
    glyphs.set(glyph.codepoint, {
      advance: glyph.advance,
      bearingX: glyph.bearingX,
      bearingY: glyph.bearingY,
      height: glyph.height,
      page: page >= 0 && page < pageCount ? page : 0,
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
    encoding: data.encoding ?? 'raster',
    glyphs,
    kerning,
    metrics: {
      ascent: data.metrics.ascent,
      descent: data.metrics.descent,
      lineGap: data.metrics.lineGap,
    },
    pages: data.pages.slice(),
  };
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

// The texture atlas for one page of a multi-page font, or `null` when `page` is out of range. Page 0
// is the primary page. The pixels a renderer uploads and samples for glyphs whose `page` matches.
// Immutable: the font shares these references, it does not clone the atlases.
export function getBitmapFontPage(font: Readonly<BitmapFont>, page = 0): TextureAtlas | null {
  return font.pages[page] ?? null;
}

// The font's page-indexed atlas list — one `TextureAtlas` per page image. A single-page font has
// length 1; each glyph's `page` indexes this array. Immutable: shared, not cloned.
export function getBitmapFontPages(font: Readonly<BitmapFont>): readonly TextureAtlas[] {
  return font.pages;
}

// Packs an adjacent glyph pair into the single-number kerning-map key `(left << 16) | right`. Both
// codepoints are assumed to lie in the Basic Multilingual Plane (< 0x10000); supplementary-plane
// pairs are outside this table's addressable range.
function packBitmapFontKerningKey(left: number, right: number): number {
  return (left << 16) | right;
}
