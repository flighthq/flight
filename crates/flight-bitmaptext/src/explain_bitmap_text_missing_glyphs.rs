use std::collections::HashSet;

use flight_entity::Ref;
use flight_glyphatlas::GlyphSource;

use crate::types::BitmapTextMissingGlyphs;
use crate::update_bitmap_text::call_glyph_source_get_entry;

/// Inventories unique missing codepoints in first-seen order while counting every non-newline
/// codepoint (TS `explainBitmapTextMissingGlyphs`).
pub fn explain_bitmap_text_missing_glyphs(
    glyph_source: &Ref<GlyphSource>,
    text: &str,
) -> BitmapTextMissingGlyphs {
    let mut seen = HashSet::new();
    let mut missing_codepoints = Vec::new();
    let mut total_codepoints = 0;
    for character in text.chars() {
        let codepoint = character as u32;
        if codepoint == 0x0a || codepoint == 0x0d {
            continue;
        }
        total_codepoints += 1;
        if !seen.insert(codepoint) {
            continue;
        }
        if call_glyph_source_get_entry(glyph_source, codepoint).is_none() {
            missing_codepoints.push(codepoint);
        }
    }
    return BitmapTextMissingGlyphs {
        missing_codepoints,
        total_codepoints,
    };
}
