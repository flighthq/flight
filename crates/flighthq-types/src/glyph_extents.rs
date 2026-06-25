// Ink bounding box of a single glyph, as reported by the text-shaping layer. All values are in
// pixels. `x_bearing` and `y_bearing` are the offsets from the glyph origin to the top-left corner
// of the ink box (positive y is down).

/// Ink bounding box of a single glyph.
#[derive(Copy, Clone, Debug, Default, PartialEq)]
pub struct GlyphExtents {
    pub height: f32,
    pub width: f32,
    pub x_bearing: f32,
    pub y_bearing: f32,
}
