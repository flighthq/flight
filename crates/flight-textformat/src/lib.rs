mod font_variation;
mod text_format;
mod text_format_range;

pub mod contract;

pub use font_variation::{
    FONT_VARIATION_ITALIC, FONT_VARIATION_OPTICAL_SIZE, FONT_VARIATION_SLANT,
    FONT_VARIATION_WEIGHT, FONT_VARIATION_WIDTH, FontVariation,
};
pub use text_format::{TextFormat, TextFormatAlign, TextFormatListMarker};
pub use text_format_range::{TextFormatRange, create_text_format_range};
