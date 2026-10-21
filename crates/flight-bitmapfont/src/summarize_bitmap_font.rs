use flight_entity::Ref;
use flight_textureatlas::get_texture_atlas_byte_size;

use crate::types::*;

pub fn summarize_bitmap_font(font: &Ref<BitmapFont>) -> BitmapFontSummary {
    let font = font.read().unwrap();
    let mut byte_size = 0;
    for page in font.pages.iter().flatten() {
        byte_size += get_texture_atlas_byte_size(&page.read().unwrap());
    }
    let mut min_codepoint = -1;
    let mut max_codepoint = -1;
    for codepoint in font.glyph_order.iter().copied() {
        let codepoint = codepoint as i32;
        if min_codepoint < 0 || codepoint < min_codepoint {
            min_codepoint = codepoint;
        }
        if codepoint > max_codepoint {
            max_codepoint = codepoint;
        }
    }
    return BitmapFontSummary {
        byte_size,
        glyph_count: font.glyphs.len(),
        kerning_pair_count: font.kerning.len(),
        max_codepoint,
        min_codepoint,
        page_count: font.pages.len(),
    };
}
