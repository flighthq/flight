use crate::types::BitmapTextAlign;

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for BitmapTextAlign
pub fn get_bitmap_text_align_string(value: BitmapTextAlign) -> &'static str {
    return match value {
        BitmapTextAlign::Center => "center",
        BitmapTextAlign::Justify => "justify",
        BitmapTextAlign::Left => "left",
        BitmapTextAlign::Right => "right",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser paired with the BitmapTextAlign table
pub fn parse_bitmap_text_align(value: &str) -> Option<BitmapTextAlign> {
    return match value {
        "center" => Some(BitmapTextAlign::Center),
        "justify" => Some(BitmapTextAlign::Justify),
        "left" => Some(BitmapTextAlign::Left),
        "right" => Some(BitmapTextAlign::Right),
        _ => None,
    };
}
