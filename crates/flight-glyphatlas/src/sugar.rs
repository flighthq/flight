use std::sync::Arc;

use flight_bitmap::Bitmap;
use flight_entity::Ref;
use flight_font::GlyphMetrics;
use flight_geometry::Rectangle;
use flight_log::LogStateRef;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, Mutex, RwLock};

    use flight_font::{GlyphRasterizedBitmap, HostGlyphRasterizerCapability};
    use flight_log::{
        LogData, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
        get_memory_log_sink_entries,
    };

    use super::*;

    fn backend(calls: Arc<Mutex<Vec<u32>>>) -> HostGlyphRasterizerCapability {
        return HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(move |codepoint, _options| {
                calls.lock().unwrap().push(codepoint);
                return Some(GlyphRasterizedBitmap {
                    advance: 8.0,
                    bearing_x: 1,
                    bearing_y: 8,
                    height: 8,
                    pixels: vec![255; 8 * 8 * 4].into_boxed_slice(),
                    width: 8,
                });
            }),
        };
    }

    fn null_backend() -> HostGlyphRasterizerCapability {
        return HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(|_codepoint, _options| None),
        };
    }

    fn options(backend: HostGlyphRasterizerCapability) -> GlyphAtlasOptions {
        return GlyphAtlasOptions {
            font_family: "mock".to_string(),
            font_size: 16.0,
            font_style: None,
            font_weight: None,
            height: 64,
            max_area: None,
            max_bytes: None,
            max_glyphs: None,
            padding: None,
            rasterizer_backend: backend,
            width: 64,
        };
    }

    fn message(data: &LogData) -> String {
        let LogData::Record(fields) = data else {
            panic!("expected record");
        };
        let Some(LogValue::Str(message)) = fields.get("message") else {
            panic!("expected message");
        };
        return message.clone();
    }

    #[test]
    fn glyph_atlas_clear_dirty_matches_clear_glyph_atlas_dirty() {
        let method = create_glyph_atlas(&options(backend(Arc::new(Mutex::new(Vec::new())))));
        let function = create_glyph_atlas(&options(backend(Arc::new(Mutex::new(Vec::new())))));
        get_glyph_atlas_entry(&method, 65);
        get_glyph_atlas_entry(&function, 65);
        method.clear_dirty();
        clear_glyph_atlas_dirty(&function);
        assert_eq!(
            method.get_dirty_region(),
            get_glyph_atlas_dirty_region(&function)
        );
    }

    #[test]
    fn glyph_atlas_constructors_match_their_free_functions() {
        let options = options(null_backend());
        let method = GlyphAtlas::new(&options);
        let function = create_glyph_atlas(&options);
        assert_eq!(
            method.get_bitmap().read().unwrap().width,
            get_glyph_atlas_bitmap(&function).read().unwrap().width
        );
        let method_source = GlyphSource::new(&method);
        let function_source = create_glyph_source_from_glyph_atlas(&function);
        assert_eq!(
            (method_source.read().unwrap().get_glyph_layout_version)(),
            (function_source.read().unwrap().get_glyph_layout_version)()
        );
    }

    #[test]
    fn glyph_atlas_disable_guards_matches_disable_glyph_atlas_guards() {
        let method = create_glyph_atlas(&options(null_backend()));
        let function = create_glyph_atlas(&options(null_backend()));
        let method_calls = Arc::new(Mutex::new(0));
        let function_calls = Arc::new(Mutex::new(0));
        let method_record = method_calls.clone();
        let function_record = function_calls.clone();
        set_glyph_atlas_entry_guard(
            &method,
            Some(Arc::new(move |_notice| *method_record.lock().unwrap() += 1)),
        );
        set_glyph_atlas_entry_guard(
            &function,
            Some(Arc::new(move |_notice| {
                *function_record.lock().unwrap() += 1
            })),
        );
        method.disable_guards();
        disable_glyph_atlas_guards(&function);
        get_glyph_atlas_entry(&method, 65);
        get_glyph_atlas_entry(&function, 65);
        assert_eq!(
            *method_calls.lock().unwrap(),
            *function_calls.lock().unwrap()
        );
    }

    #[test]
    fn glyph_atlas_dispose_matches_dispose_glyph_atlas() {
        let method_calls = Arc::new(Mutex::new(Vec::new()));
        let function_calls = Arc::new(Mutex::new(Vec::new()));
        let method = create_glyph_atlas(&options(backend(method_calls.clone())));
        let function = create_glyph_atlas(&options(backend(function_calls.clone())));
        get_glyph_atlas_entry(&method, 65);
        get_glyph_atlas_entry(&function, 65);
        method.dispose();
        dispose_glyph_atlas(&function);
        get_glyph_atlas_entry(&method, 65);
        get_glyph_atlas_entry(&function, 65);
        assert_eq!(
            *method_calls.lock().unwrap(),
            *function_calls.lock().unwrap()
        );
        assert_eq!(
            method.get_layout_version(),
            get_glyph_atlas_layout_version(&function)
        );
    }

    #[test]
    fn glyph_atlas_enable_guards_matches_enable_glyph_atlas_guards() {
        let method = create_glyph_atlas(&options(null_backend()));
        let function = create_glyph_atlas(&options(null_backend()));
        let method_log = Arc::new(RwLock::new(create_log_state()));
        let function_log = Arc::new(RwLock::new(create_log_state()));
        let method_sink = create_memory_log_sink(2);
        let function_sink = create_memory_log_sink(2);
        add_log_sink(&method_log, method_sink.sink.clone());
        add_log_sink(&function_log, function_sink.sink.clone());
        method.enable_guards(&method_log, Arc::new(|| 9.0));
        enable_glyph_atlas_guards(&function, &function_log, Arc::new(|| 9.0));
        get_glyph_atlas_entry(&method, 65);
        get_glyph_atlas_entry(&function, 65);
        let method_entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &method_sink);
            collected
        };
        let function_entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &function_sink);
            collected
        };
        assert_eq!(method_entries.len(), function_entries.len());
        assert_eq!(
            message(&method_entries[0].data),
            message(&function_entries[0].data)
        );
        assert_eq!(
            method_entries[0].timestamp_ms,
            function_entries[0].timestamp_ms
        );
    }

    #[test]
    fn glyph_atlas_explain_entry_matches_explain_glyph_atlas_entry() {
        let atlas = create_glyph_atlas(&options(null_backend()));
        assert_eq!(
            atlas.explain_entry(65),
            explain_glyph_atlas_entry(&atlas, 65)
        );
    }

    #[test]
    fn glyph_atlas_get_bitmap_matches_get_glyph_atlas_bitmap() {
        let atlas = create_glyph_atlas(&options(null_backend()));
        assert!(Arc::ptr_eq(
            &atlas.get_bitmap(),
            &get_glyph_atlas_bitmap(&atlas)
        ));
    }

    #[test]
    fn glyph_atlas_get_dirty_region_matches_get_glyph_atlas_dirty_region() {
        let atlas = create_glyph_atlas(&options(backend(Arc::new(Mutex::new(Vec::new())))));
        get_glyph_atlas_entry(&atlas, 65);
        assert_eq!(
            atlas.get_dirty_region(),
            get_glyph_atlas_dirty_region(&atlas)
        );
    }

    #[test]
    fn glyph_atlas_get_codepoints_matches_get_glyph_atlas_codepoints() {
        let atlas = create_glyph_atlas(&options(backend(Arc::new(Mutex::new(Vec::new())))));
        get_glyph_atlas_entry(&atlas, 65);
        assert_eq!(atlas.get_codepoints(), get_glyph_atlas_codepoints(&atlas));
    }

    #[test]
    fn glyph_atlas_get_entry_matches_get_glyph_atlas_entry() {
        let atlas = create_glyph_atlas(&options(backend(Arc::new(Mutex::new(Vec::new())))));
        let method = atlas.get_entry(65).unwrap();
        let function = get_glyph_atlas_entry(&atlas, 65).unwrap();
        assert!(Arc::ptr_eq(&method, &function));
    }

    #[test]
    fn glyph_atlas_get_kerning_matches_get_glyph_atlas_kerning() {
        let atlas = create_glyph_atlas(&options(null_backend()));
        assert_eq!(
            atlas.get_kerning(65, 66),
            get_glyph_atlas_kerning(&atlas, 65, 66)
        );
    }

    #[test]
    fn glyph_atlas_get_layout_version_matches_get_glyph_atlas_layout_version() {
        let atlas = create_glyph_atlas(&options(null_backend()));
        assert_eq!(
            atlas.get_layout_version(),
            get_glyph_atlas_layout_version(&atlas)
        );
    }

    #[test]
    fn glyph_atlas_get_metrics_matches_get_glyph_atlas_metrics() {
        let atlas = create_glyph_atlas(&options(null_backend()));
        assert!(Arc::ptr_eq(
            &atlas.get_metrics(),
            &get_glyph_atlas_metrics(&atlas)
        ));
    }
}

pub trait GlyphAtlasMethods {
    fn clear_dirty(&self);
    fn disable_guards(&self);
    fn dispose(&self);
    fn enable_guards(&self, log_state: &LogStateRef, clock: GlyphAtlasClock);
    fn explain_entry(&self, codepoint: u32) -> GlyphAtlasEntryExplanation;
    fn get_bitmap(&self) -> Ref<Bitmap>;
    fn get_codepoints(&self) -> Vec<u32>;
    fn get_dirty_region(&self) -> Option<Rectangle>;
    fn get_entry(&self, codepoint: u32) -> Option<Ref<GlyphEntry>>;
    fn get_kerning(&self, left: u32, right: u32) -> f32;
    fn get_layout_version(&self) -> u32;
    fn get_metrics(&self) -> Arc<GlyphMetrics>;
}

impl GlyphAtlasMethods for Ref<GlyphAtlas> {
    fn clear_dirty(&self) {
        return clear_glyph_atlas_dirty(self);
    }

    fn disable_guards(&self) {
        return disable_glyph_atlas_guards(self);
    }

    fn dispose(&self) {
        return dispose_glyph_atlas(self);
    }

    fn enable_guards(&self, log_state: &LogStateRef, clock: GlyphAtlasClock) {
        return enable_glyph_atlas_guards(self, log_state, clock);
    }

    fn explain_entry(&self, codepoint: u32) -> GlyphAtlasEntryExplanation {
        return explain_glyph_atlas_entry(self, codepoint);
    }

    fn get_bitmap(&self) -> Ref<Bitmap> {
        return get_glyph_atlas_bitmap(self);
    }

    fn get_codepoints(&self) -> Vec<u32> {
        return get_glyph_atlas_codepoints(self);
    }

    fn get_dirty_region(&self) -> Option<Rectangle> {
        return get_glyph_atlas_dirty_region(self);
    }

    fn get_entry(&self, codepoint: u32) -> Option<Ref<GlyphEntry>> {
        return get_glyph_atlas_entry(self, codepoint);
    }

    fn get_kerning(&self, left: u32, right: u32) -> f32 {
        return get_glyph_atlas_kerning(self, left, right);
    }

    fn get_layout_version(&self) -> u32 {
        return get_glyph_atlas_layout_version(self);
    }

    fn get_metrics(&self) -> Arc<GlyphMetrics> {
        return get_glyph_atlas_metrics(self);
    }
}

impl GlyphAtlas {
    pub fn new(options: &GlyphAtlasOptions) -> Ref<Self> {
        return create_glyph_atlas(options);
    }
}

impl GlyphSource {
    pub fn new(atlas: &Ref<GlyphAtlas>) -> Ref<Self> {
        return create_glyph_source_from_glyph_atlas(atlas);
    }
}
