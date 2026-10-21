use flight_entity::Ref;

use crate::types::*;

pub fn explain_bitmap_font_glyph(
    font: &Ref<BitmapFont>,
    codepoint: u32,
) -> BitmapFontGlyphExplanation {
    let font = font.read().unwrap();
    let page_count = font.pages.len();
    let Some(glyph) = font.glyphs.get(&codepoint) else {
        return BitmapFontGlyphExplanation {
            glyph_height: 0,
            glyph_width: 0,
            page: -1,
            page_count,
            reason: BitmapFontGlyphExplanationReason::NoGlyph,
            renderable: false,
        };
    };
    let glyph = glyph.read().unwrap();
    let reason = if page_count == 0 {
        BitmapFontGlyphExplanationReason::NoPages
    } else if glyph.width == 0 || glyph.height == 0 {
        BitmapFontGlyphExplanationReason::EmptyGlyph
    } else {
        BitmapFontGlyphExplanationReason::Ok
    };
    return BitmapFontGlyphExplanation {
        glyph_height: glyph.height,
        glyph_width: glyph.width,
        page: glyph.page as i32,
        page_count,
        reason,
        renderable: reason == BitmapFontGlyphExplanationReason::Ok,
    };
}
