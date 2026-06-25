// Ink bounding box of a single glyph, as reported by the text-shaping layer. All values are in
// pixels. xBearing and yBearing are the offsets from the glyph origin to the top-left corner of
// the ink box (positive y is down).
export interface GlyphExtents {
  height: number;
  width: number;
  xBearing: number;
  yBearing: number;
}
