use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_font::GlyphMetrics;
use flight_glyphatlas::{GlyphAtlasOptions, GlyphSource, create_glyph_atlas};
use flight_log::{
    add_log_sink, create_log_state, create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_textureatlas::create_texture_atlas;

use super::*;

fn create_test_data() -> BitmapFontData {
    return BitmapFontData {
        encoding: None,
        glyphs: vec![BitmapFontGlyphData {
            advance: 9.0,
            bearing_x: 1,
            bearing_y: 8,
            codepoint: 65,
            height: 8,
            page: None,
            width: 7,
            x: 0,
            y: 0,
        }],
        kerning: None,
        metrics: GlyphMetrics {
            ascent: 8.0,
            descent: 2.0,
            line_gap: 1.0,
        },
        pages: vec![Some(create_texture_atlas(None))],
    };
}

#[test]
fn bitmap_font_constructors_match_their_free_functions() {
    let state = BitmapFontGuardState::new();
    let method = BitmapFont::new(&state, &create_test_data());
    let function = create_bitmap_font(&state, &create_test_data());
    assert_eq!(
        method.get_glyph(65).unwrap().read().unwrap().width,
        function.get_glyph(65).unwrap().read().unwrap().width
    );
    let mut initialized: BitmapFont = allocate_entity();
    initialized.initialize(&state, &create_test_data());
    assert_eq!(
        initialized.glyphs.len(),
        function.read().unwrap().glyphs.len()
    );
}

#[test]
fn bitmap_font_guard_state_methods_match_free_functions() {
    let state = BitmapFontGuardState::new();
    state.set_guard(Some(Arc::new(|_, _, _| {})));
    assert!(state.read().unwrap().guard.is_some());
    state.disable();
    assert!(state.read().unwrap().guard.is_none());
    let logs = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(1);
    add_log_sink(&logs, sink.sink.clone());
    state.enable(&logs, Arc::new(|| 3.0));
    let mut invalid = create_test_data();
    invalid.glyphs[0].page = Some(3);
    BitmapFont::new(&state, &invalid);
    assert_eq!(get_memory_log_sink_entries(&sink).len(), 1);
}

#[test]
fn bitmap_font_methods_match_their_free_functions() {
    let state = BitmapFontGuardState::new();
    let font = BitmapFont::new(&state, &create_test_data());
    assert!(Arc::ptr_eq(
        &font.get_glyph(65).unwrap(),
        &get_bitmap_font_glyph(&font, 65).unwrap()
    ));
    assert_eq!(
        font.get_kerning(65, 66),
        get_bitmap_font_kerning(&font, 65, 66)
    );
    assert!(Arc::ptr_eq(
        &font.get_metrics(),
        &get_bitmap_font_metrics(&font)
    ));
    assert!(Arc::ptr_eq(
        &font.get_page(None).unwrap(),
        &get_bitmap_font_page(&font, None).unwrap()
    ));
    assert_eq!(font.get_pages().len(), get_bitmap_font_pages(&font).len());
    assert_eq!(font.has_glyph(65), has_bitmap_font_glyph(&font, 65));
    assert_eq!(font.explain_glyph(65), explain_bitmap_font_glyph(&font, 65));
    assert_eq!(font.summarize(), summarize_bitmap_font(&font));
    let source = font.create_glyph_source();
    assert!(Arc::ptr_eq(
        &(source.read().unwrap().get_glyph_entry)(65).unwrap(),
        &font.get_glyph(65).unwrap()
    ));
}

#[test]
fn glyph_atlas_conversion_method_matches_the_free_function() {
    let backend = flight_font::HostGlyphRasterizerCapability {
        measure_metrics: None,
        provider: Arc::new(()),
        rasterize: Arc::new(|_, _| None),
    };
    let atlas = create_glyph_atlas(&GlyphAtlasOptions {
        font_family: "mock".to_string(),
        font_size: 16.0,
        font_style: None,
        font_weight: None,
        height: 8,
        max_area: None,
        max_bytes: None,
        max_glyphs: None,
        padding: None,
        rasterizer_backend: backend,
        width: 8,
    });
    let state = BitmapFontGuardState::new();
    let method = atlas.create_bitmap_font(&state);
    let function = create_bitmap_font_from_glyph_atlas(&state, &atlas);
    assert_eq!(method.summarize(), function.summarize());
}

#[test]
fn glyph_source_initialize_method_matches_the_free_initializer() {
    let state = BitmapFontGuardState::new();
    let font = BitmapFont::new(&state, &create_test_data());
    let mut method: GlyphSource = allocate_entity();
    let mut function: GlyphSource = allocate_entity();
    method.initialize_from_bitmap_font(&font);
    initialize_glyph_source_from_bitmap_font(&mut function, &font);
    assert_eq!(
        (method.get_glyph_entry)(65).unwrap().read().unwrap().width,
        (function.get_glyph_entry)(65)
            .unwrap()
            .read()
            .unwrap()
            .width
    );
    assert_eq!(
        (method.get_glyph_layout_version)(),
        (function.get_glyph_layout_version)()
    );
}

#[test]
fn kerning_pair_unpack_method_matches_the_free_function() {
    let key = pack_bitmap_font_kerning_key(0x1f600, 0x41);
    let mut method = BitmapFontKerningPair::default();
    let mut function = BitmapFontKerningPair::default();
    method.unpack(key);
    unpack_bitmap_font_kerning_key(&mut function, key);
    assert_eq!(method, function);
}

#[test]
fn vocabulary_methods_match_their_canonical_string_tables() {
    assert_eq!(
        BitmapFontEncoding::Sdf.as_str(),
        get_bitmap_font_encoding_string(BitmapFontEncoding::Sdf)
    );
    assert_eq!(
        BitmapFontGlyphExplanationReason::NoPages.as_str(),
        get_bitmap_font_glyph_explanation_reason_string(BitmapFontGlyphExplanationReason::NoPages)
    );
    assert_eq!(
        BitmapFontGuardLogKey::PageOutOfRange.as_str(),
        get_bitmap_font_guard_log_key_string(BitmapFontGuardLogKey::PageOutOfRange)
    );
    assert_eq!(
        BitmapFontGuardReason::PageOutOfRange.as_str(),
        get_bitmap_font_guard_reason_string(BitmapFontGuardReason::PageOutOfRange)
    );
}
