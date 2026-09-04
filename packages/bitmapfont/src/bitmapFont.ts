import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  BitmapFont,
  BitmapFontData,
  BitmapFontKerningPair,
  EntityConstruction,
  GlyphEntry,
  GlyphMetrics,
  TextureAtlas,
} from '@flighthq/types/contract';

export function createBitmapFont(data: Readonly<BitmapFontData>): BitmapFont {
  const out = allocateEntity<BitmapFont>();
  initializeBitmapFont(out, data);
  return finishEntity(out);
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

// Whether the font carries a glyph for `codepoint`. Distinct from `getBitmapFontGlyph(...) !== null`
// only in intent, but that intent is the point: a caller choosing a fallback font, or filtering a string
// to what this font can draw, asks a question about coverage and should not have to name the sentinel to
// get an answer. Cheap enough for a per-character loop — one map lookup, no allocation.
export function hasBitmapFontGlyph(font: Readonly<BitmapFont>, codepoint: number): boolean {
  return font.glyphs.has(codepoint);
}

// Builds an immutable static bitmap font from plain data: the glyph list becomes a
// `codepoint → GlyphEntry` map, the kerning pairs become a `left * 0x110000 + right → amount` map, and
// the page-indexed atlas list, line metrics, and encoding (default `raster`) are carried as-is. Each
// glyph's `page` (default 0) indexes `data.pages`; an out-of-range page is clamped to 0 so the glyph
// is still placed (on the primary page) rather than dropped — a bad page index is a source-data
// defect the font should survive, not a reason to lose a glyph. Nothing mutates the font after this
// call — it is the static counterpart to the growing `@flighthq/glyphatlas`.
export function initializeBitmapFont(out: EntityConstruction<BitmapFont>, data: Readonly<BitmapFontData>): void {
  const pageCount = data.pages.length;
  const glyphs = new Map<number, GlyphEntry>();
  for (const glyph of data.glyphs) {
    const page = glyph.page ?? 0;
    glyphs.set(glyph.codepoint, {
      advance: glyph.advance,
      bearingX: glyph.bearingX,
      bearingY: glyph.bearingY,
      height: glyph.height,
      page: resolveBitmapFontGlyphPage(glyph.codepoint, page, pageCount),
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
  out.encoding = data.encoding ?? 'raster';
  out.glyphs = glyphs;
  out.kerning = kerning;
  out.metrics = {
    ascent: data.metrics.ascent,
    descent: data.metrics.descent,
    lineGap: data.metrics.lineGap,
  };
  out.pages = data.pages.slice();
}

// Packs an adjacent glyph pair into the single-number kerning-map key `left * 0x110000 + right`. The
// inverse is `unpackBitmapFontKerningKey`; the two are one primitive and must move together.
//
// Multiplication rather than `(left << 16) | right`, because Unicode does not fit in 16 bits and the
// shift silently ALIASED rather than failing. JavaScript's bitwise operators truncate to 32 bits, so a
// supplementary-plane left glyph wrapped into another pair's key: U+10000 followed by 'A' produced the
// same key as U+0000 followed by 'A', and U+1F600 the same as U+F600. A font with emoji kerning would
// return the wrong adjustment for an unrelated BMP pair, which is worse than returning none.
//
// `0x110000` is the Unicode codepoint space (U+0000..U+10FFFF inclusive), so every pair maps to a
// distinct key. The largest key is 0x10FFFF * 0x110000 + 0x10FFFF, about 1.24e12 — comfortably inside
// the 2^53 range where a double holds every integer exactly, so this stays exact arithmetic and never
// touches the 32-bit bitwise path. A C++ port would use a 64-bit integer key for the same reason.
export function packBitmapFontKerningKey(left: number, right: number): number {
  return left * UNICODE_CODEPOINT_SPACE + right;
}

// Installs the caller-facing guard invoked when `createBitmapFont` silently repairs source data. The
// core carries the seam and never the message: `@flighthq/bitmapfont` has no dependency on
// `@flighthq/log`, and the wording lives in the separately-importable `enableBitmapFontGuards`.
export function setBitmapFontGuard(guard: ((reason: string, codepoint: number, page: number) => void) | null): void {
  _guard = guard;
}

// Recovers the adjacent glyph pair a kerning key encodes, into `out`. The exact inverse of
// `packBitmapFontKerningKey`, and the reason a codec walking `font.kerning.keys()` never hand-rolls the
// arithmetic: a `>>> 16` / `& 0xffff` inverse reads a 0x110000-radix key as a 16-bit one, emitting
// garbage codepoints for ordinary BMP pairs and truncating every key past 2^32 outright.
//
// Division and remainder, not shifts, for the same exactness reason the pack multiplies — the key
// leaves the 32-bit range well inside the supported codepoint space.
export function unpackBitmapFontKerningKey(key: number, out: BitmapFontKerningPair): BitmapFontKerningPair {
  out.left = Math.floor(key / UNICODE_CODEPOINT_SPACE);
  out.right = key % UNICODE_CODEPOINT_SPACE;
  return out;
}

// The page a glyph is placed on. An out-of-range index is clamped to the primary page so the glyph is
// still drawn — a bad page index is a source-data defect the font should survive rather than a reason to
// lose a glyph — but the clamp is reported through the guard seam, because a silently relocated glyph
// renders the wrong pixels and looks like a packing bug rather than a bad font file.
function resolveBitmapFontGlyphPage(codepoint: number, page: number, pageCount: number): number {
  if (page >= 0 && page < pageCount) return page;
  _guard?.('page-out-of-range', codepoint, page);
  return 0;
}

// U+0000..U+10FFFF inclusive — the stride that keeps one pair's key out of the next pair's range.
const UNICODE_CODEPOINT_SPACE = 0x110000;

let _guard: ((reason: string, codepoint: number, page: number) => void) | null = null;
