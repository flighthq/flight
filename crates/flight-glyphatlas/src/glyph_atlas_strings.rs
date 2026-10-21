use crate::types::{GlyphAtlasEntryBlockReason, GlyphAtlasEntryGuardReason, GlyphAtlasGuardLogKey};

// flight-lint: allow(conform-extra) D9e exact Rust string table for the TS block-reason union
pub fn get_glyph_atlas_entry_block_reason_string(
    reason: GlyphAtlasEntryBlockReason,
) -> &'static str {
    return match reason {
        GlyphAtlasEntryBlockReason::GlyphLargerThanAtlas => "glyph-larger-than-atlas",
        GlyphAtlasEntryBlockReason::Ok => "ok",
        GlyphAtlasEntryBlockReason::RasterizerReturnedNull => "rasterizer-returned-null",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the typed guard-reason union
pub fn get_glyph_atlas_entry_guard_reason_string(
    reason: GlyphAtlasEntryGuardReason,
) -> &'static str {
    return match reason {
        GlyphAtlasEntryGuardReason::GlyphLargerThanAtlas => "glyph-larger-than-atlas",
        GlyphAtlasEntryGuardReason::RasterizerReturnedNull => "rasterizer-returned-null",
        GlyphAtlasEntryGuardReason::Repack => "repack",
        GlyphAtlasEntryGuardReason::RepackDropped => "repack-dropped",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the closed guard log keys
pub fn get_glyph_atlas_guard_log_key_string(key: GlyphAtlasGuardLogKey) -> &'static str {
    return match key {
        GlyphAtlasGuardLogKey::GlyphLargerThanAtlas => "glyphatlas:glyph-larger-than-atlas",
        GlyphAtlasGuardLogKey::RasterizerReturnedNull => "glyphatlas:rasterizer-returned-null",
        GlyphAtlasGuardLogKey::RepackDropped => "glyphatlas:repack-dropped",
        GlyphAtlasGuardLogKey::RepackThrashing => "glyphatlas:repack-thrashing",
    };
}

// flight-lint: allow(conform-extra) D9e exact parser for the TS block-reason union
pub fn parse_glyph_atlas_entry_block_reason(value: &str) -> Option<GlyphAtlasEntryBlockReason> {
    return match value {
        "glyph-larger-than-atlas" => Some(GlyphAtlasEntryBlockReason::GlyphLargerThanAtlas),
        "ok" => Some(GlyphAtlasEntryBlockReason::Ok),
        "rasterizer-returned-null" => Some(GlyphAtlasEntryBlockReason::RasterizerReturnedNull),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e exact parser for the typed guard-reason union
pub fn parse_glyph_atlas_entry_guard_reason(value: &str) -> Option<GlyphAtlasEntryGuardReason> {
    return match value {
        "glyph-larger-than-atlas" => Some(GlyphAtlasEntryGuardReason::GlyphLargerThanAtlas),
        "rasterizer-returned-null" => Some(GlyphAtlasEntryGuardReason::RasterizerReturnedNull),
        "repack" => Some(GlyphAtlasEntryGuardReason::Repack),
        "repack-dropped" => Some(GlyphAtlasEntryGuardReason::RepackDropped),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e exact parser for the closed guard log keys
pub fn parse_glyph_atlas_guard_log_key(value: &str) -> Option<GlyphAtlasGuardLogKey> {
    return match value {
        "glyphatlas:glyph-larger-than-atlas" => Some(GlyphAtlasGuardLogKey::GlyphLargerThanAtlas),
        "glyphatlas:rasterizer-returned-null" => {
            Some(GlyphAtlasGuardLogKey::RasterizerReturnedNull)
        }
        "glyphatlas:repack-dropped" => Some(GlyphAtlasGuardLogKey::RepackDropped),
        "glyphatlas:repack-thrashing" => Some(GlyphAtlasGuardLogKey::RepackThrashing),
        _ => None,
    };
}
