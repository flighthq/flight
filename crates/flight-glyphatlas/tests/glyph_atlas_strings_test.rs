use flight_glyphatlas::contract::*;

mod get_glyph_atlas_entry_block_reason_string {
    use super::*;

    #[test]
    fn returns_exact_typescript_strings() {
        assert_eq!(
            get_glyph_atlas_entry_block_reason_string(
                GlyphAtlasEntryBlockReason::GlyphLargerThanAtlas
            ),
            "glyph-larger-than-atlas"
        );
        assert_eq!(
            get_glyph_atlas_entry_block_reason_string(GlyphAtlasEntryBlockReason::Ok),
            "ok"
        );
        assert_eq!(
            get_glyph_atlas_entry_block_reason_string(
                GlyphAtlasEntryBlockReason::RasterizerReturnedNull
            ),
            "rasterizer-returned-null"
        );
    }
}

mod get_glyph_atlas_entry_guard_reason_string {
    use super::*;

    #[test]
    fn returns_exact_typed_guard_strings() {
        assert_eq!(
            get_glyph_atlas_entry_guard_reason_string(GlyphAtlasEntryGuardReason::Repack),
            "repack"
        );
        assert_eq!(
            get_glyph_atlas_entry_guard_reason_string(GlyphAtlasEntryGuardReason::RepackDropped),
            "repack-dropped"
        );
    }
}

mod get_glyph_atlas_guard_log_key_string {
    use super::*;

    #[test]
    fn returns_exact_once_only_log_keys() {
        assert_eq!(
            get_glyph_atlas_guard_log_key_string(GlyphAtlasGuardLogKey::GlyphLargerThanAtlas),
            "glyphatlas:glyph-larger-than-atlas"
        );
        assert_eq!(
            get_glyph_atlas_guard_log_key_string(GlyphAtlasGuardLogKey::RasterizerReturnedNull),
            "glyphatlas:rasterizer-returned-null"
        );
        assert_eq!(
            get_glyph_atlas_guard_log_key_string(GlyphAtlasGuardLogKey::RepackDropped),
            "glyphatlas:repack-dropped"
        );
        assert_eq!(
            get_glyph_atlas_guard_log_key_string(GlyphAtlasGuardLogKey::RepackThrashing),
            "glyphatlas:repack-thrashing"
        );
    }
}

mod parse_glyph_atlas_entry_block_reason {
    use super::*;

    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(
            parse_glyph_atlas_entry_block_reason("ok"),
            Some(GlyphAtlasEntryBlockReason::Ok)
        );
        assert!(parse_glyph_atlas_entry_block_reason("vendor").is_none());
    }
}

mod parse_glyph_atlas_entry_guard_reason {
    use super::*;

    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(
            parse_glyph_atlas_entry_guard_reason("repack-dropped"),
            Some(GlyphAtlasEntryGuardReason::RepackDropped)
        );
        assert!(parse_glyph_atlas_entry_guard_reason("repacked").is_none());
    }
}

mod parse_glyph_atlas_guard_log_key {
    use super::*;

    #[test]
    fn parses_exact_keys_and_rejects_unknown_values() {
        assert_eq!(
            parse_glyph_atlas_guard_log_key("glyphatlas:repack-thrashing"),
            Some(GlyphAtlasGuardLogKey::RepackThrashing)
        );
        assert!(parse_glyph_atlas_guard_log_key("glyphatlas:other").is_none());
    }
}
