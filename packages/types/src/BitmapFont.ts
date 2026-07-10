import type { BitmapGlyph } from './BitmapGlyph';
import type { Entity } from './Entity';
import type { TextureAtlas } from './TextureAtlas';

// A kerning adjustment applied between an adjacent pair of glyphs: when the code point `first` is
// immediately followed by `second`, the pen advance is nudged by `amount` pixels (usually negative,
// pulling the pair closer). Stored as flat data on the font — a satellite of the BitmapFont concept.
export interface BitmapFontKerning {
  amount: number;
  // Code point of the left glyph in the pair.
  first: number;
  // Code point of the right glyph in the pair.
  second: number;
}

// A bitmap font: a TextureAtlas of glyph pixel rectangles composed with per-glyph placement metrics
// and kerning. The raster-glyph counterpart to a FontResource — where a FontResource names an outline
// font the platform rasterizes, a BitmapFont carries its own baked glyph pixels (in `atlas`) plus the
// metrics needed to lay them out. A glyph's pixel rectangle is a region in `atlas` keyed by the
// glyph's code-point `id`; the placement metrics live in the matching BitmapGlyph. Parsed from
// authoring formats by @flighthq/bitmapfont-formats; queried and measured by @flighthq/bitmapfont.
export interface BitmapFont extends Entity {
  // Glyph pixel rectangles, one region per glyph, keyed by code point (region.id === glyph.id). Null
  // until an image/atlas is attached (a freshly parsed font references page files not yet loaded).
  atlas: TextureAtlas | null;
  // Pixels from the top of a line down to the glyph baseline.
  base: number;
  // Source face name, for identification only (never used for layout).
  face: string | null;
  // Per-glyph placement metrics, keyed by code point.
  glyphs: BitmapGlyph[];
  // Adjacent-pair kerning adjustments.
  kernings: BitmapFontKerning[];
  // Pixels between successive baselines.
  lineHeight: number;
  // Pixel size the font was authored/baked at. Layers that scale to a different display size divide
  // by this.
  size: number;
}
