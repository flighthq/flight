import type { GlyphEntry, GlyphMetrics } from './GlyphSource';
import type { TextureAtlas } from './TextureAtlas';

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
// key `(left << 16) | right` (both codepoints in the Basic Multilingual Plane), holding the
// horizontal adjustment in pixels.
export interface BitmapFont {
  encoding: BitmapFontEncoding;
  glyphs: Map<number, GlyphEntry>;
  kerning: Map<number, number>;
  metrics: GlyphMetrics;
  pages: readonly TextureAtlas[];
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
  pages: readonly TextureAtlas[];
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
// kerning map under the key `(left << 16) | right`.
export interface BitmapFontKerningData {
  amount: number;
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
