// Per-glyph placement metrics for a BitmapFont. The glyph's pixel rectangle (its x/y/width/height in
// the page image) is NOT stored here — it lives in the font's TextureAtlas as a region keyed by this
// same `id`. BitmapGlyph carries only the metrics the layout and render path apply on top of that
// rectangle. This split is the composition the package is built on: the atlas region says *where the
// pixels are*, BitmapGlyph says *how to place and advance them*. Look the rectangle up with
// getBitmapFontGlyphRegion.
export interface BitmapGlyph {
  // Unicode code point this glyph renders. Also the id of its region in the font's atlas.
  id: number;
  // Page (atlas image) index this glyph's pixels live on. 0 for single-page fonts.
  page: number;
  // Pixels the pen advances horizontally after drawing this glyph.
  xadvance: number;
  // Horizontal offset, in pixels, from the pen position to the glyph rectangle's left edge.
  xoffset: number;
  // Vertical offset, in pixels, from the line top down to the glyph rectangle's top edge.
  yoffset: number;
}
