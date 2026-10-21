use flight_entity::Ref;

use crate::types::{
    GlyphAtlas, GlyphAtlasEntryBlockReason, GlyphAtlasEntryExplanation, get_glyph_atlas_runtime,
};

pub fn explain_glyph_atlas_entry(
    atlas: &Ref<GlyphAtlas>,
    codepoint: u32,
) -> GlyphAtlasEntryExplanation {
    let runtime = get_glyph_atlas_runtime(atlas);
    let runtime = runtime.read().unwrap();
    let bitmap = runtime.bitmap.read().unwrap();
    let usable_width = bitmap.width as i32 - 2 * runtime.padding as i32;
    let usable_height = bitmap.height as i32 - 2 * runtime.padding as i32;
    if let Some(entry) = runtime.entries.get(&codepoint) {
        let entry = entry.read().unwrap();
        return GlyphAtlasEntryExplanation {
            renderable: true,
            reason: GlyphAtlasEntryBlockReason::Ok,
            glyph_width: entry.width,
            glyph_height: entry.height,
            usable_width,
            usable_height,
        };
    }
    let rasterized = runtime
        .rasterizer_backend
        .rasterize(codepoint, &runtime.rasterize_options);
    let Some(rasterized) = rasterized else {
        return GlyphAtlasEntryExplanation {
            renderable: false,
            reason: GlyphAtlasEntryBlockReason::RasterizerReturnedNull,
            glyph_width: 0,
            glyph_height: 0,
            usable_width,
            usable_height,
        };
    };
    let renderable = rasterized.width as i64 <= i64::from(usable_width)
        && rasterized.height as i64 <= i64::from(usable_height);
    return GlyphAtlasEntryExplanation {
        renderable,
        reason: if renderable {
            GlyphAtlasEntryBlockReason::Ok
        } else {
            GlyphAtlasEntryBlockReason::GlyphLargerThanAtlas
        },
        glyph_width: rasterized.width,
        glyph_height: rasterized.height,
        usable_width,
        usable_height,
    };
}
