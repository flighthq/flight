use std::sync::Arc;

use flight_font::{GlyphRasterizeOptions, HostGlyphRasterizerCapability};
use flight_glyphatlas::contract::*;

mod allocate_stub_glyph_rasterizer_backend {
    use super::*;

    #[test]
    fn fills_every_pixel_with_opaque_white() {
        let backend = allocate_stub_glyph_rasterizer_backend();
        let options = GlyphRasterizeOptions {
            font_family: "mock".to_string(),
            font_size: 16.0,
            font_style: None,
            font_weight: None,
        };
        let glyph = (backend.rasterize)(65, &options).unwrap();
        assert!(glyph.pixels.iter().all(|value| *value == 255));
    }

    #[test]
    fn preserves_the_source_pixel_and_rounding_rules() {
        let backend = allocate_stub_glyph_rasterizer_backend();
        let options = GlyphRasterizeOptions {
            font_family: "mock".to_string(),
            font_size: 16.0,
            font_style: None,
            font_weight: None,
        };
        let glyph = (backend.rasterize)(65, &options).unwrap();
        assert_eq!(glyph.width, 10);
        assert_eq!(glyph.height, 11);
        assert_eq!(glyph.advance, 12.0);
        assert_eq!(glyph.bearing_x, 0);
        assert_eq!(glyph.bearing_y, 11);
        assert_eq!(glyph.pixels.len(), 10 * 11 * 4);
    }

    #[test]
    fn returns_a_backend_with_fresh_provider_identity() {
        let a = allocate_stub_glyph_rasterizer_backend();
        let b = allocate_stub_glyph_rasterizer_backend();
        assert!(!Arc::ptr_eq(&a.provider, &b.provider));
    }
}

mod initialize_stub_glyph_rasterizer_backend {
    use super::*;

    #[test]
    fn installs_the_stub_callback_without_replacing_provider_identity() {
        let provider = Arc::new(()) as Arc<dyn std::any::Any + Send + Sync>;
        let mut backend = HostGlyphRasterizerCapability {
            measure_metrics: Some(Arc::new(|_options| None)),
            provider: provider.clone(),
            rasterize: Arc::new(|_codepoint, _options| None),
        };
        initialize_stub_glyph_rasterizer_backend(&mut backend);
        let options = GlyphRasterizeOptions {
            font_family: "m".to_string(),
            font_size: 1.0,
            font_style: None,
            font_weight: None,
        };
        assert!((backend.rasterize)(1, &options).is_some());
        assert!(backend.measure_metrics.is_none());
        assert!(Arc::ptr_eq(&backend.provider, &provider));
    }
}
