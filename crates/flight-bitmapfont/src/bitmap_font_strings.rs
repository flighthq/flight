use crate::types::*;

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for BitmapFontEncoding
pub fn get_bitmap_font_encoding_string(value: BitmapFontEncoding) -> &'static str {
    return match value {
        BitmapFontEncoding::Msdf => "msdf",
        BitmapFontEncoding::Raster => "raster",
        BitmapFontEncoding::Sdf => "sdf",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for BitmapFontGlyphExplanationReason
pub fn get_bitmap_font_glyph_explanation_reason_string(
    value: BitmapFontGlyphExplanationReason,
) -> &'static str {
    return match value {
        BitmapFontGlyphExplanationReason::EmptyGlyph => "empty-glyph",
        BitmapFontGlyphExplanationReason::NoGlyph => "no-glyph",
        BitmapFontGlyphExplanationReason::NoPages => "no-pages",
        BitmapFontGlyphExplanationReason::Ok => "ok",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical once-key table for bitmap-font guard logging
pub fn get_bitmap_font_guard_log_key_string(value: BitmapFontGuardLogKey) -> &'static str {
    return match value {
        BitmapFontGuardLogKey::PageOutOfRange => "bitmapfont:page-out-of-range",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the bitmap-font guard reason
pub fn get_bitmap_font_guard_reason_string(value: BitmapFontGuardReason) -> &'static str {
    return match value {
        BitmapFontGuardReason::PageOutOfRange => "page-out-of-range",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser paired with the BitmapFontEncoding table
pub fn parse_bitmap_font_encoding(value: &str) -> Option<BitmapFontEncoding> {
    return match value {
        "msdf" => Some(BitmapFontEncoding::Msdf),
        "raster" => Some(BitmapFontEncoding::Raster),
        "sdf" => Some(BitmapFontEncoding::Sdf),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser paired with the BitmapFontGlyphExplanationReason table
pub fn parse_bitmap_font_glyph_explanation_reason(
    value: &str,
) -> Option<BitmapFontGlyphExplanationReason> {
    return match value {
        "empty-glyph" => Some(BitmapFontGlyphExplanationReason::EmptyGlyph),
        "no-glyph" => Some(BitmapFontGlyphExplanationReason::NoGlyph),
        "no-pages" => Some(BitmapFontGlyphExplanationReason::NoPages),
        "ok" => Some(BitmapFontGlyphExplanationReason::Ok),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser paired with the bitmap-font guard once-key table
pub fn parse_bitmap_font_guard_log_key(value: &str) -> Option<BitmapFontGuardLogKey> {
    return match value {
        "bitmapfont:page-out-of-range" => Some(BitmapFontGuardLogKey::PageOutOfRange),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser paired with the bitmap-font guard reason table
pub fn parse_bitmap_font_guard_reason(value: &str) -> Option<BitmapFontGuardReason> {
    return match value {
        "page-out-of-range" => Some(BitmapFontGuardReason::PageOutOfRange),
        _ => None,
    };
}
