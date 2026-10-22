use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use flight_entity::allocate_entity;
use flight_font::{
    GlyphMetrics, GlyphRasterizeFontWeight, GlyphRasterizedBitmap, HostGlyphRasterizerCapability,
};
use flight_glyphatlas::contract::*;

use crate::support::{atlas_options, mock_rasterizer, null_backend};

mod create_glyph_atlas {
    use super::*;

    #[test]
    fn allocates_the_requested_bitmap_with_an_empty_cache_and_default_padding() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 128, 64));
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        let bitmap = bitmap.read().unwrap();
        assert_eq!(bitmap.width, 128);
        assert_eq!(bitmap.height, 64);
        assert!(get_glyph_atlas_entry(&atlas, 65).is_none());
        assert!(get_glyph_atlas_dirty_region(&atlas).is_none());
    }

    #[test]
    fn binds_each_atlas_to_its_own_backend() {
        let local = mock_rasterizer(|_| (8, 8));
        let global = mock_rasterizer(|_| (8, 8));
        let local_atlas = create_glyph_atlas(&atlas_options(local.backend, 64, 64));
        let global_atlas = create_glyph_atlas(&atlas_options(global.backend, 64, 64));
        get_glyph_atlas_entry(&local_atlas, 65);
        get_glyph_atlas_entry(&global_atlas, 66);
        assert_eq!(*local.calls.lock().unwrap(), vec![65]);
        assert_eq!(*global.calls.lock().unwrap(), vec![66]);
    }

    #[test]
    fn forwards_optional_font_style_and_weight_verbatim() {
        let seen = Arc::new(Mutex::new(None));
        let callback_seen = seen.clone();
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(move |_codepoint, options| {
                *callback_seen.lock().unwrap() = Some(options.clone());
                return Some(GlyphRasterizedBitmap {
                    advance: 4.0,
                    bearing_x: 0,
                    bearing_y: 0,
                    height: 4,
                    pixels: vec![0; 64].into_boxed_slice(),
                    width: 4,
                });
            }),
        };
        let mut options = atlas_options(backend, 64, 64);
        options.font_style = Some("italic".to_string());
        options.font_weight = Some("bold".to_string());
        let atlas = create_glyph_atlas(&options);
        get_glyph_atlas_entry(&atlas, 65);
        let seen = seen.lock().unwrap().clone().unwrap();
        assert_eq!(seen.font_style.as_deref(), Some("italic"));
        assert_eq!(
            seen.font_weight,
            Some(GlyphRasterizeFontWeight::String(
                flight_font::GlyphRasterizeFontWeightString {
                    value: "bold".to_string(),
                }
            ))
        );
    }

    #[test]
    fn leaves_optional_font_style_and_weight_absent_when_not_supplied() {
        let seen = Arc::new(Mutex::new(None));
        let callback_seen = seen.clone();
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(move |_codepoint, options| {
                *callback_seen.lock().unwrap() = Some(options.clone());
                return Some(GlyphRasterizedBitmap {
                    advance: 1.0,
                    bearing_x: 0,
                    bearing_y: 1,
                    height: 1,
                    pixels: vec![0; 4].into_boxed_slice(),
                    width: 1,
                });
            }),
        };
        let atlas = create_glyph_atlas(&atlas_options(backend, 64, 64));
        get_glyph_atlas_entry(&atlas, 65);
        let seen = seen.lock().unwrap().clone().unwrap();
        assert!(seen.font_style.is_none());
        assert!(seen.font_weight.is_none());
    }

    #[test]
    fn measures_once_and_reuses_the_exact_bound_options_for_rasterization() {
        let measured_pointer = Arc::new(AtomicUsize::new(0));
        let rasterized_pointer = Arc::new(AtomicUsize::new(0));
        let measure_record = measured_pointer.clone();
        let rasterize_record = rasterized_pointer.clone();
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: Some(Arc::new(move |options| {
                measure_record.store(options as *const _ as usize, Ordering::SeqCst);
                return Some(GlyphMetrics {
                    ascent: 13.0,
                    descent: 3.0,
                    line_gap: 0.0,
                });
            })),
            provider: Arc::new(()),
            rasterize: Arc::new(move |_codepoint, options| {
                rasterize_record.store(options as *const _ as usize, Ordering::SeqCst);
                return Some(GlyphRasterizedBitmap {
                    advance: 1.0,
                    bearing_x: 0,
                    bearing_y: 1,
                    height: 1,
                    pixels: vec![255; 4].into_boxed_slice(),
                    width: 1,
                });
            }),
        };
        let atlas = create_glyph_atlas(&atlas_options(backend, 64, 64));
        assert_eq!(
            *get_glyph_atlas_metrics(&atlas),
            GlyphMetrics {
                ascent: 13.0,
                descent: 3.0,
                line_gap: 0.0,
            }
        );
        get_glyph_atlas_entry(&atlas, 65);
        assert_ne!(measured_pointer.load(Ordering::SeqCst), 0);
        assert_eq!(
            measured_pointer.load(Ordering::SeqCst),
            rasterized_pointer.load(Ordering::SeqCst)
        );
    }

    #[test]
    fn propagates_a_metrics_backend_panic_with_exact_payload_identity() {
        #[derive(Debug)]
        struct MetricsFailure;

        let failure = Arc::new(MetricsFailure);
        let callback_failure = failure.clone();
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: Some(Arc::new(move |_options| {
                std::panic::panic_any(callback_failure.clone());
            })),
            provider: Arc::new(()),
            rasterize: Arc::new(|_codepoint, _options| None),
        };
        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            create_glyph_atlas(&atlas_options(backend, 64, 64));
        }))
        .unwrap_err();
        let caught = caught.downcast::<Arc<MetricsFailure>>().unwrap();
        assert!(Arc::ptr_eq(&failure, &caught));
    }
}

mod derive_glyph_metrics_from_font_size {
    use super::*;

    #[test]
    fn splits_the_em_into_ascent_descent_and_zero_line_gap() {
        assert_eq!(
            derive_glyph_metrics_from_font_size(10.0),
            GlyphMetrics {
                ascent: 8.0,
                descent: 2.0,
                line_gap: 0.0,
            }
        );
    }
}

mod dispose_glyph_atlas {
    use super::*;

    #[test]
    fn clears_cached_state_and_reuses_the_entity_shell() {
        let mock = mock_rasterizer(|_| (8, 8));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 128, 128));
        get_glyph_atlas_entry(&atlas, 65);
        dispose_glyph_atlas(&atlas);
        assert!(get_glyph_atlas_dirty_region(&atlas).is_none());
        get_glyph_atlas_entry(&atlas, 65);
        assert_eq!(*mock.calls.lock().unwrap(), vec![65, 65]);
    }

    #[test]
    fn bumps_layout_version_because_old_rects_become_reusable() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 128, 128));
        let before = get_glyph_atlas_layout_version(&atlas);
        dispose_glyph_atlas(&atlas);
        assert_eq!(get_glyph_atlas_layout_version(&atlas), before + 1);
    }
}

mod get_glyph_atlas_bitmap {
    use super::*;

    #[test]
    fn returns_the_same_backing_bitmap_on_every_query() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 32, 32));
        let first = get_glyph_atlas_bitmap(&atlas);
        let second = get_glyph_atlas_bitmap(&atlas);
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod get_glyph_atlas_codepoints {
    use super::*;

    #[test]
    fn clears_and_fills_cached_codepoints_in_insertion_order_without_rasterizing() {
        let mock = mock_rasterizer(|_| (8, 8));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 128, 128));
        get_glyph_atlas_entry(&atlas, 66);
        get_glyph_atlas_entry(&atlas, 65);
        get_glyph_atlas_entry(&atlas, 66);
        let mut out = vec![99];
        get_glyph_atlas_codepoints(&mut out, &atlas);
        assert_eq!(out, vec![66, 65]);
        assert_eq!(*mock.calls.lock().unwrap(), vec![66, 65]);
    }

    #[test]
    fn reuses_caller_capacity_across_calls() {
        let mock = mock_rasterizer(|_| (8, 8));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 128, 128));
        get_glyph_atlas_entry(&atlas, 65);
        let mut out = Vec::with_capacity(4);
        let allocation = out.as_ptr();
        get_glyph_atlas_codepoints(&mut out, &atlas);
        assert_eq!(out, vec![65]);
        assert_eq!(out.as_ptr(), allocation);
        get_glyph_atlas_entry(&atlas, 66);
        get_glyph_atlas_codepoints(&mut out, &atlas);
        assert_eq!(out, vec![65, 66]);
        assert_eq!(out.as_ptr(), allocation);
    }
}

mod get_glyph_atlas_layout_version {
    use super::*;

    #[test]
    fn stays_stable_when_glyphs_append_into_free_space() {
        let mock = mock_rasterizer(|_| (8, 8));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 128, 128));
        get_glyph_atlas_entry(&atlas, 65);
        get_glyph_atlas_entry(&atlas, 66);
        assert_eq!(get_glyph_atlas_layout_version(&atlas), 0);
        assert!(get_glyph_atlas_dirty_region(&atlas).is_some());
    }
}

mod initialize_glyph_atlas {
    use super::*;

    #[test]
    fn reinitializes_a_caller_allocated_entity() {
        let mut atlas: GlyphAtlas = allocate_entity();
        initialize_glyph_atlas(&mut atlas, &atlas_options(null_backend(), 19, 23));
        let atlas = Arc::new(std::sync::RwLock::new(atlas));
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        assert_eq!(bitmap.read().unwrap().width, 19);
        assert_eq!(bitmap.read().unwrap().height, 23);
    }
}
