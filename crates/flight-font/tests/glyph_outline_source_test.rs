use std::sync::Arc;

use flight_font::contract::*;
use flight_path::{PathWinding, append_path_close, append_path_line_to, append_path_move_to};

fn create_test_glyph_outline_source() -> Arc<GlyphOutlineSource> {
    return Arc::new(GlyphOutlineSource {
        get_glyph_outline: Arc::new(|out, glyph_index| {
            out.commands.clear();
            out.data.clear();
            out.winding = PathWinding::NonZero;
            if glyph_index == 1 {
                return true;
            }
            if glyph_index != 0 {
                return false;
            }
            append_path_move_to(out, -100.0, -800.0);
            append_path_line_to(out, 500.0, -800.0);
            append_path_line_to(out, 500.0, 200.0);
            append_path_line_to(out, -100.0, 200.0);
            append_path_close(out);
            return true;
        }),
        get_glyph_outline_advance: Arc::new(|glyph_index| {
            return if glyph_index == 1 { 250.0 } else { 600.0 };
        }),
        get_glyph_outline_index_for_code_point: Arc::new(|code_point| {
            return match code_point {
                0x41 => 0,
                0x20 => 1,
                _ => -1,
            };
        }),
        get_glyph_outline_metrics: Arc::new(|| {
            return GlyphOutlineMetrics {
                ascent: 800.0,
                descent: 200.0,
                line_gap: 100.0,
                units_per_em: 1000.0,
            };
        }),
    });
}

fn create_test_glyph_rasterize_options(font_size: f32) -> GlyphRasterizeOptions {
    return GlyphRasterizeOptions {
        font_family: "embedded".to_string(),
        font_size,
        font_style: None,
        font_weight: None,
    };
}

mod allocate_glyph_rasterizer_backend_from_glyph_outline_source {
    use super::*;

    #[test]
    fn maps_codepoints_and_rasterizes_design_unit_outlines_at_the_requested_em_size() {
        let backend = allocate_glyph_rasterizer_backend_from_glyph_outline_source(
            create_test_glyph_outline_source(),
        );
        let raster = (backend.rasterize)(0x41, &create_test_glyph_rasterize_options(20.0)).unwrap();
        assert_eq!(raster.advance, 12.0);
        assert_eq!(raster.bearing_x, -3);
        assert_eq!(raster.bearing_y, 17);
        assert_eq!(raster.width, 14);
        assert_eq!(raster.height, 22);
        assert!(
            raster
                .pixels
                .iter()
                .enumerate()
                .any(|(index, value)| index % 4 == 3 && *value == 0xff)
        );
        assert_eq!(raster.pixels[3], 0);
    }

    #[test]
    fn preserves_the_exact_bound_outline_source_as_provider_identity() {
        let source = create_test_glyph_outline_source();
        let backend = allocate_glyph_rasterizer_backend_from_glyph_outline_source(source.clone());
        let provider = backend
            .provider
            .clone()
            .downcast::<GlyphOutlineSource>()
            .unwrap();
        assert!(Arc::ptr_eq(&source, &provider));
    }

    #[test]
    fn rasterizes_fractional_coverage_with_the_four_by_four_rounding_rule() {
        let source = Arc::new(GlyphOutlineSource {
            get_glyph_outline: Arc::new(|out, _glyph_index| {
                append_path_move_to(out, 0.0, 0.0);
                append_path_line_to(out, 0.5, 0.0);
                append_path_line_to(out, 0.5, 1.0);
                append_path_line_to(out, 0.0, 1.0);
                append_path_close(out);
                return true;
            }),
            get_glyph_outline_advance: Arc::new(|_glyph_index| 1.0),
            get_glyph_outline_index_for_code_point: Arc::new(|_code_point| 0),
            get_glyph_outline_metrics: Arc::new(|| GlyphOutlineMetrics {
                ascent: 1.0,
                descent: 0.0,
                line_gap: 0.0,
                units_per_em: 1.0,
            }),
        });
        let backend = allocate_glyph_rasterizer_backend_from_glyph_outline_source(source);
        let raster = (backend.rasterize)(0x41, &create_test_glyph_rasterize_options(1.0)).unwrap();
        let covered_pixel = (1 * raster.width as usize + 1) * 4;
        assert_eq!(raster.pixels[covered_pixel], 0xff);
        assert_eq!(raster.pixels[covered_pixel + 3], 128);
    }

    #[test]
    fn returns_a_zero_area_raster_with_an_advance_for_an_empty_glyph() {
        let backend = allocate_glyph_rasterizer_backend_from_glyph_outline_source(
            create_test_glyph_outline_source(),
        );
        let raster = (backend.rasterize)(0x20, &create_test_glyph_rasterize_options(20.0)).unwrap();
        assert_eq!(raster.advance, 5.0);
        assert_eq!(raster.bearing_x, 0);
        assert_eq!(raster.bearing_y, 0);
        assert_eq!(raster.height, 0);
        assert!(raster.pixels.is_empty());
        assert_eq!(raster.width, 0);
    }

    #[test]
    fn returns_null_for_missing_glyphs_invalid_scales_and_nonfinite_advances() {
        let backend = allocate_glyph_rasterizer_backend_from_glyph_outline_source(
            create_test_glyph_outline_source(),
        );
        assert!((backend.rasterize)(0x42, &create_test_glyph_rasterize_options(20.0)).is_none());
        assert!((backend.rasterize)(0x41, &create_test_glyph_rasterize_options(0.0)).is_none());
        assert!(
            (backend.rasterize)(0x41, &create_test_glyph_rasterize_options(f32::NAN)).is_none()
        );
        assert!(
            (backend.rasterize)(0x41, &create_test_glyph_rasterize_options(f32::INFINITY))
                .is_none()
        );

        let source = Arc::new(GlyphOutlineSource {
            get_glyph_outline: Arc::new(|_out, _glyph_index| true),
            get_glyph_outline_advance: Arc::new(|_glyph_index| f32::NAN),
            get_glyph_outline_index_for_code_point: Arc::new(|_code_point| 0),
            get_glyph_outline_metrics: Arc::new(|| GlyphOutlineMetrics {
                ascent: 1.0,
                descent: 1.0,
                line_gap: 0.0,
                units_per_em: 1.0,
            }),
        });
        let backend = allocate_glyph_rasterizer_backend_from_glyph_outline_source(source);
        assert!((backend.rasterize)(0x41, &create_test_glyph_rasterize_options(1.0)).is_none());
    }

    #[test]
    fn returns_scaled_outline_metrics_to_the_consumer() {
        let backend = allocate_glyph_rasterizer_backend_from_glyph_outline_source(
            create_test_glyph_outline_source(),
        );
        assert_eq!(
            backend.measure_metrics.as_ref().unwrap()(&create_test_glyph_rasterize_options(20.0)),
            Some(GlyphMetrics {
                ascent: 16.0,
                descent: 4.0,
                line_gap: 2.0,
            })
        );
    }
}

mod initialize_glyph_rasterizer_backend_from_glyph_outline_source {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_allocate() {
        let source = create_test_glyph_outline_source();
        let mut backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(|_code_point, _options| None),
        };
        initialize_glyph_rasterizer_backend_from_glyph_outline_source(&mut backend, source.clone());
        let provider = backend
            .provider
            .clone()
            .downcast::<GlyphOutlineSource>()
            .unwrap();
        assert!(Arc::ptr_eq(&source, &provider));
        assert!((backend.rasterize)(0x41, &create_test_glyph_rasterize_options(20.0)).is_some());
    }
}
