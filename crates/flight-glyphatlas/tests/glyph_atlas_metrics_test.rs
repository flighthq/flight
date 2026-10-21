use std::sync::Arc;

use flight_font::{GlyphMetrics, HostGlyphRasterizerCapability};
use flight_glyphatlas::contract::*;

use crate::support::{atlas_options, null_backend};

mod get_glyph_atlas_kerning {
    use super::*;

    #[test]
    fn returns_zero_without_a_pair_kerning_source() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 64, 64));
        assert_eq!(get_glyph_atlas_kerning(&atlas, 65, 66), 0.0);
    }
}

mod get_glyph_atlas_metrics {
    use super::*;

    #[test]
    fn falls_back_when_measurement_is_absent_or_declined() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 64, 64));
        assert_eq!(
            *get_glyph_atlas_metrics(&atlas),
            derive_glyph_metrics_from_font_size(16.0)
        );
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: Some(Arc::new(|_options| None)),
            provider: Arc::new(()),
            rasterize: Arc::new(|_codepoint, _options| None),
        };
        let atlas = create_glyph_atlas(&atlas_options(backend, 64, 64));
        assert_eq!(
            *get_glyph_atlas_metrics(&atlas),
            derive_glyph_metrics_from_font_size(16.0)
        );
    }

    #[test]
    fn reports_the_backend_measurement_when_available() {
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: Some(Arc::new(|_options| {
                return Some(GlyphMetrics {
                    ascent: 13.5,
                    descent: 3.25,
                    line_gap: 0.0,
                });
            })),
            provider: Arc::new(()),
            rasterize: Arc::new(|_codepoint, _options| None),
        };
        let atlas = create_glyph_atlas(&atlas_options(backend, 64, 64));
        assert_eq!(
            *get_glyph_atlas_metrics(&atlas),
            GlyphMetrics {
                ascent: 13.5,
                descent: 3.25,
                line_gap: 0.0,
            }
        );
    }

    #[test]
    fn preserves_the_exact_metrics_record_identity() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 64, 64));
        let first = get_glyph_atlas_metrics(&atlas);
        let second = get_glyph_atlas_metrics(&atlas);
        assert!(Arc::ptr_eq(&first, &second));
    }
}
