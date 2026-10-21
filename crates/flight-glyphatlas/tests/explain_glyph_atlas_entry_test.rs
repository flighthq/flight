use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use flight_font::{GlyphRasterizedBitmap, HostGlyphRasterizerCapability};
use flight_glyphatlas::contract::*;

use crate::support::{atlas_options, backend_producing};

mod explain_glyph_atlas_entry {
    use super::*;

    #[test]
    fn agrees_with_a_real_entry_from_an_equivalent_atlas() {
        let subject = create_glyph_atlas(&atlas_options(backend_producing(4, 4), 64, 64));
        let explanation = create_glyph_atlas(&atlas_options(backend_producing(4, 4), 64, 64));
        let entry = get_glyph_atlas_entry(&subject, 65).unwrap();
        let entry = entry.read().unwrap();
        assert_eq!(
            explain_glyph_atlas_entry(&explanation, 65),
            GlyphAtlasEntryExplanation {
                renderable: true,
                reason: GlyphAtlasEntryBlockReason::Ok,
                glyph_width: entry.width,
                glyph_height: entry.height,
                usable_width: 62,
                usable_height: 62,
            }
        );
    }

    #[test]
    fn distinguishes_a_glyph_larger_than_the_atlas_and_reports_sizes() {
        let atlas = create_glyph_atlas(&atlas_options(backend_producing(200, 8), 64, 64));
        assert_eq!(
            explain_glyph_atlas_entry(&atlas, 65),
            GlyphAtlasEntryExplanation {
                renderable: false,
                reason: GlyphAtlasEntryBlockReason::GlyphLargerThanAtlas,
                glyph_width: 200,
                glyph_height: 8,
                usable_width: 62,
                usable_height: 62,
            }
        );
    }

    #[test]
    fn distinguishes_a_rasterizer_that_produces_nothing() {
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(|_codepoint, _options| None),
        };
        let atlas = create_glyph_atlas(&atlas_options(backend, 64, 64));
        let explanation = explain_glyph_atlas_entry(&atlas, 65);
        assert!(!explanation.renderable);
        assert_eq!(
            explanation.reason,
            GlyphAtlasEntryBlockReason::RasterizerReturnedNull
        );
        assert_eq!(explanation.glyph_width, 0);
        assert_eq!(explanation.glyph_height, 0);
    }

    #[test]
    fn reports_a_cached_glyph_without_rasterizing_again() {
        let calls = Arc::new(AtomicU32::new(0));
        let callback_calls = calls.clone();
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(move |_codepoint, _options| {
                callback_calls.fetch_add(1, Ordering::SeqCst);
                return Some(GlyphRasterizedBitmap {
                    advance: 8.0,
                    bearing_x: 0,
                    bearing_y: 8,
                    height: 8,
                    pixels: vec![0; 256].into_boxed_slice(),
                    width: 8,
                });
            }),
        };
        let atlas = create_glyph_atlas(&atlas_options(backend, 64, 64));
        get_glyph_atlas_entry(&atlas, 65);
        let explanation = explain_glyph_atlas_entry(&atlas, 65);
        assert_eq!(explanation.reason, GlyphAtlasEntryBlockReason::Ok);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn reports_ok_with_measured_sizes_for_a_glyph_that_fits() {
        let atlas = create_glyph_atlas(&atlas_options(backend_producing(8, 8), 64, 64));
        let explanation = explain_glyph_atlas_entry(&atlas, 65);
        assert!(explanation.renderable);
        assert_eq!(explanation.reason, GlyphAtlasEntryBlockReason::Ok);
        assert_eq!(explanation.glyph_width, 8);
        assert_eq!(explanation.glyph_height, 8);
        assert_eq!(explanation.usable_width, 62);
        assert_eq!(explanation.usable_height, 62);
    }

    #[test]
    fn preserves_negative_usable_bounds_for_an_atlas_smaller_than_its_gutters() {
        let atlas = create_glyph_atlas(&atlas_options(backend_producing(0, 0), 1, 1));
        let explanation = explain_glyph_atlas_entry(&atlas, 65);
        assert!(!explanation.renderable);
        assert_eq!(explanation.usable_width, -1);
        assert_eq!(explanation.usable_height, -1);
    }
}
