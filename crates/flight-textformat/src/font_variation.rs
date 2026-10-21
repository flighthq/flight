/// One readonly OpenType tag/value record. Custom tags remain strings, as in the source.
#[derive(Clone, Debug, PartialEq)]
pub struct FontVariation {
    pub axis: String,
    pub value: f32,
}

pub const FONT_VARIATION_ITALIC: &str = "ital";
pub const FONT_VARIATION_OPTICAL_SIZE: &str = "opsz";
pub const FONT_VARIATION_SLANT: &str = "slnt";
pub const FONT_VARIATION_WEIGHT: &str = "wght";
pub const FONT_VARIATION_WIDTH: &str = "wdth";
