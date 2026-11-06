// The bitmapfont-owned contracts. They import their dependencies directly from the owning packages.

import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { GlyphMetrics } from '@flighthq/font/contract';
import type { GlyphEntry } from '@flighthq/glyphatlas/contract';
import type { TextureAtlas } from '@flighthq/textureatlas/contract';

interface BitmapFontEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

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

// How a bitmap font's glyphs are encoded in its atlas pixels. `raster` is a plain pre-rendered
// bitmap (the games-standard textured-quad path); `sdf`/`msdf` are signed-distance-field encodings a
// crisp-scaling shader in `render-gl`/`render-wgpu` decodes. This is metadata carried on the font —
// the field selects the shader; `@flighthq/bitmapfont` does not generate distance fields.
export type BitmapFontEncoding = 'msdf' | 'raster' | 'sdf';

// An immutable static bitmap font: a page-indexed list of texture atlases whose glyphs are already
// baked, a `codepoint → GlyphEntry` lookup, a kerning table, shared line metrics, and the glyph
// encoding. A multi-page font spreads its glyphs across N atlas page images; `pages[0]` is the
// primary page and each glyph's `page` field indexes this array. A single-page font is simply
// `pages.length === 1`. It is the static implementation of the `GlyphSource` seam (see
// `createGlyphSourceFromBitmapFont`), the sibling of the dynamic `@flighthq/glyphatlas`. Build one
// with `createBitmapFont`; nothing mutates it after creation. `kerning` is keyed by the packed pair
// key `left * 0x110000 + right` — the full Unicode codepoint space, not a 16-bit shift — holding the
// horizontal adjustment in pixels. Build and read that key with `packBitmapFontKerningKey` /
// `unpackBitmapFontKerningKey`; the arithmetic is theirs to own, not a callsite's to re-derive.
export interface BitmapFont extends BitmapFontEntity {
  encoding: BitmapFontEncoding;
  glyphs: Map<number, GlyphEntry>;
  kerning: Map<number, number>;
  metrics: GlyphMetrics;
  pages: readonly (TextureAtlas | undefined)[];
}

// The plain-data input to `createBitmapFont`: the page-indexed atlas list, the glyph list, an
// optional kerning pair list, the line metrics, and an optional encoding (defaults to `raster`).
// This is the header-layer description a font codec (`@flighthq/bitmapfont-formats`) or
// `bakeBitmapFont` fills in; the constructor turns the lists into the font's lookup maps. Each
// glyph's `page` must index into `pages`.
export interface BitmapFontData {
  encoding?: BitmapFontEncoding;
  glyphs: readonly BitmapFontGlyphData[];
  kerning?: readonly BitmapFontKerningData[];
  metrics: GlyphMetrics;
  pages: readonly (TextureAtlas | undefined)[];
}

// One glyph in a `BitmapFontData` construction input: a codepoint plus the `GlyphEntry` fields (atlas
// rectangle, pen advance, bearing offset, and the atlas page the rect samples from). `createBitmapFont`
// copies each into the font's glyph map keyed by `codepoint`. `page` defaults to 0 and indexes the
// font's `pages` array — which atlas image the glyph's rectangle is cut from.
export interface BitmapFontGlyphData {
  advance: number;
  bearingX: number;
  bearingY: number;
  codepoint: number;
  height: number;
  page?: number;
  width: number;
  x: number;
  y: number;
}

// One kerning pair in a `BitmapFontData` construction input: the horizontal `amount` (pixels) applied
// between an adjacent `left`/`right` codepoint pair. `createBitmapFont` packs each into the font's
// kerning map under the key `packBitmapFontKerningKey(left, right)`.
export interface BitmapFontKerningData {
  amount: number;
  left: number;
  right: number;
}

// The adjacent glyph pair a kerning key encodes — the `out` target `unpackBitmapFontKerningKey` writes
// the two codepoints into, so reading a font's kerning keys back allocates nothing per pair. Carries no
// `amount`: the key identifies the pair, the map value carries the adjustment.
export interface BitmapFontKerningPair {
  left: number;
  right: number;
}

// Options for the `@flighthq/bitmapfont-formats` parsers (`parseBitmapFontFnt`/`parseBitmapFontXml`/
// `parseBitmapFontJson`). A `.fnt`/XML/JSON description only names its atlas page image file(s); the
// live `TextureAtlas` is a resource the codec does not load. `resolvePage` is the caller's seam that
// maps a page's `(pageId, file)` to its atlas — the same reference-then-resolve pattern as
// `@flighthq/shape-formats`' bitmap fills. It is called once per page id the font declares: a
// multi-page font resolves all of its pages. Returning `null` for a page a glyph actually samples
// (or omitting `resolvePage` entirely) makes the parse fail with the `null` sentinel, since the font
// could not be assembled; a `null` for a declared-but-unreferenced page is tolerated (that page is
// simply absent from the font).
export interface BitmapFontParseOptions {
  resolvePage?: (pageId: number, file: string) => TextureAtlas | null;
}
