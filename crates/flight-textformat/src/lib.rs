mod font_variation;
mod text_format;
mod text_format_range_raw;

pub mod contract;

pub use font_variation::{
    FontVariation, FontVariationItalic, FontVariationOpticalSize, FontVariationSlant,
    FontVariationWeight, FontVariationWidth,
};
pub use text_format::{
    TextFormat, TextFormatAlign, TextFormatListMarker, get_text_format_ascent,
    get_text_format_descent, get_text_format_height, get_text_format_leading, merge_text_format,
};
pub use text_format_range_raw::{TextFormatRange, create_text_format_range};
