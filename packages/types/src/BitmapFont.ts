import type { GlyphEntry, GlyphMetrics } from './GlyphSource';
import type { TextureAtlas } from './TextureAtlas';

// How a bitmap font's glyphs are encoded in its atlas pixels. `raster` is a plain pre-rendered
// bitmap (the games-standard textured-quad path); `sdf`/`msdf` are signed-distance-field encodings a
// crisp-scaling shader in `render-gl`/`render-wgpu` decodes. This is metadata carried on the font —
// the field selects the shader; `@flighthq/bitmapfont` does not generate distance fields.
export type BitmapFontEncoding = 'msdf' | 'raster' | 'sdf';

// An immutable static bitmap font: a texture atlas whose glyphs are already baked, a
// `codepoint → GlyphEntry` lookup, a kerning table, shared line metrics, and the glyph encoding. It
// is the static implementation of the `GlyphSource` seam (see `createGlyphSourceFromBitmapFont`),
// the sibling of the dynamic `@flighthq/glyphatlas`. Build one with `createBitmapFont`; nothing
// mutates it after creation. `kerning` is keyed by the packed pair key `(left << 16) | right` (both
// codepoints in the Basic Multilingual Plane), holding the horizontal adjustment in pixels.
export interface BitmapFont {
  atlas: TextureAtlas;
  encoding: BitmapFontEncoding;
  glyphs: Map<number, GlyphEntry>;
  kerning: Map<number, number>;
  metrics: GlyphMetrics;
}

// The plain-data input to `createBitmapFont`: an atlas reference, the glyph list, an optional kerning
// pair list, the line metrics, and an optional encoding (defaults to `raster`). This is the
// header-layer description a font codec (`@flighthq/bitmapfont-formats`) or `bakeBitmapFont` fills
// in; the constructor turns the lists into the font's lookup maps.
export interface BitmapFontData {
  atlas: TextureAtlas;
  encoding?: BitmapFontEncoding;
  glyphs: readonly BitmapFontGlyphData[];
  kerning?: readonly BitmapFontKerningData[];
  metrics: GlyphMetrics;
}

// One glyph in a `BitmapFontData` construction input: a codepoint plus the `GlyphEntry` fields (atlas
// rectangle, pen advance, and bearing offset). `createBitmapFont` copies each into the font's glyph
// map keyed by `codepoint`.
export interface BitmapFontGlyphData {
  advance: number;
  bearingX: number;
  bearingY: number;
  codepoint: number;
  height: number;
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
// `@flighthq/shape-formats`' bitmap fills. When it is omitted, or returns `null` for the font's page,
// the parser returns the `null` sentinel (a `BitmapFont` requires a non-null atlas).
export interface BitmapFontParseOptions {
  resolvePage?: (pageId: number, file: string) => TextureAtlas | null;
}
