use std::sync::{Arc, RwLock};

use flight_glyphatlas::contract::{
    GlyphAtlas, GlyphAtlasOptions, create_glyph_atlas, create_glyph_source_from_glyph_atlas,
};
use flight_log::{
    LogData, LogStateRef, LogValue, MemoryLogSink, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};

use super::*;

fn create_tiny_glyph_atlas() -> flight_entity::Ref<GlyphAtlas> {
    return create_glyph_atlas(&GlyphAtlasOptions {
        font_family: "block".to_string(),
        font_size: 8.0,
        font_style: None,
        font_weight: None,
        height: 32,
        max_area: None,
        max_bytes: None,
        max_glyphs: None,
        padding: Some(1),
        rasterizer_backend: create_codepoint_color_rasterizer_backend(8),
        width: 32,
    });
}

fn log_fixture() -> (LogStateRef, MemoryLogSink) {
    let state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(64);
    add_log_sink(&state, sink.sink.clone());
    return (state, sink);
}

fn messages(sink: &MemoryLogSink) -> String {
    let mut messages = Vec::new();
    for entry in {
        let mut collected = Vec::new();
        get_memory_log_sink_entries(&mut collected, sink);
        collected
    } {
        if let LogData::Record(data) = entry.data
            && let Some(LogValue::Str(message)) = data.get("message")
        {
            messages.push(message.clone());
        }
    }
    return messages.join("\n");
}

mod disable_bitmap_text_guards {
    use super::*;

    #[test]
    fn stops_layout_guard_reporting() {
        let (log_state, sink) = log_fixture();
        let mut guards = guard_state();
        enable_bitmap_text_guards(&mut guards, &log_state, Arc::new(|| 0.0));
        disable_bitmap_text_guards(&mut guards);
        let source = create_glyph_source_from_glyph_atlas(&create_tiny_glyph_atlas());
        let text = create_bitmap_text(
            Some(source),
            Some(&bitmap_text_options("ABCDEFGHIJKLMNOPQRSTUVWXYZ")),
        );
        layout(&text, &guards);
        assert_eq!(messages(&sink), "");
    }

    #[test]
    fn stops_missing_glyph_reporting() {
        let (log_state, sink) = log_fixture();
        let mut guards = guard_state();
        enable_bitmap_text_guards(&mut guards, &log_state, Arc::new(|| 0.0));
        disable_bitmap_text_guards(&mut guards);
        let text = create_bitmap_text(
            Some(create_limited_glyph_source(&[0x41])),
            Some(&bitmap_text_options("AB")),
        );
        layout(&text, &guards);
        assert_eq!(messages(&sink), "");
    }
}

mod enable_bitmap_text_guards {
    use super::*;

    #[test]
    fn says_nothing_for_a_settled_layout() {
        let (log_state, sink) = log_fixture();
        let mut guards = guard_state();
        enable_bitmap_text_guards(&mut guards, &log_state, Arc::new(|| 0.0));
        let source = create_glyph_source_from_glyph_atlas(&create_tiny_glyph_atlas());
        let text = create_bitmap_text(Some(source), Some(&bitmap_text_options("ABC")));
        layout(&text, &guards);
        assert_eq!(messages(&sink), "");
    }

    #[test]
    fn warns_when_the_atlas_cannot_hold_the_string() {
        let (log_state, sink) = log_fixture();
        let mut guards = guard_state();
        enable_bitmap_text_guards(&mut guards, &log_state, Arc::new(|| 0.0));
        let source = create_glyph_source_from_glyph_atlas(&create_tiny_glyph_atlas());
        let text = create_bitmap_text(
            Some(source),
            Some(&bitmap_text_options("ABCDEFGHIJKLMNOPQRSTUVWXYZ")),
        );
        layout(&text, &guards);
        let messages = messages(&sink);
        assert!(messages.contains("never settled"));
        assert!(messages.contains("Enlarge the glyph atlas"));
    }

    #[test]
    fn warns_when_a_codepoint_has_no_glyph() {
        let (log_state, sink) = log_fixture();
        let mut guards = guard_state();
        enable_bitmap_text_guards(&mut guards, &log_state, Arc::new(|| 0.0));
        let text = create_bitmap_text(
            Some(create_limited_glyph_source(&[0x41])),
            Some(&bitmap_text_options("AB")),
        );
        layout(&text, &guards);
        let messages = messages(&sink);
        assert!(messages.contains("U+0042"));
        assert!(messages.contains("explainBitmapTextMissingGlyphs"));
    }

    #[test]
    fn says_nothing_when_all_codepoints_have_glyphs() {
        let (log_state, sink) = log_fixture();
        let mut guards = guard_state();
        enable_bitmap_text_guards(&mut guards, &log_state, Arc::new(|| 0.0));
        let text = create_bitmap_text(
            Some(create_limited_glyph_source(&[0x41, 0x42])),
            Some(&bitmap_text_options("AB")),
        );
        layout(&text, &guards);
        assert!(!messages(&sink).contains("no glyph"));
    }
}
