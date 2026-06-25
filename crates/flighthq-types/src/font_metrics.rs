// Vertical font metrics from the text-shaping layer. All values are in the font's design units
// unless the backend normalizes them to pixels (see `units_per_em`). Callers divide by
// `units_per_em` to scale to any target size.

/// Vertical font metrics from the text-shaping layer.
#[derive(Copy, Clone, Debug, Default, PartialEq)]
pub struct FontMetrics {
    pub ascent: f32,
    pub cap_height: f32,
    pub descent: f32,
    pub line_gap: f32,
    pub underline_position: f32,
    pub underline_thickness: f32,
    pub units_per_em: f32,
    pub x_height: f32,
}
