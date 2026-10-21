use std::sync::{Arc, Mutex};

use flight_bitmap::get_bitmap_pixel;
use flight_font::{GlyphRasterizedBitmap, HostGlyphRasterizerCapability};
use flight_glyphatlas::contract::*;

use crate::support::{atlas_options, mock_rasterizer};

mod get_glyph_atlas_entry {
    use super::*;

    #[test]
    fn admits_one_glyph_larger_than_a_retained_byte_budget() {
        let mock = mock_rasterizer(|_| (20, 20));
        let mut options = atlas_options(mock.backend, 256, 256);
        options.max_bytes = Some(100);
        let atlas = create_glyph_atlas(&options);
        assert!(get_glyph_atlas_entry(&atlas, 65).is_some());
        assert_eq!(*mock.calls.lock().unwrap(), vec![65]);
    }

    #[test]
    fn blits_the_glyph_pixels_into_the_entry_rectangle() {
        let mock = mock_rasterizer(|_| (8, 8));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 256, 256));
        let entry = get_glyph_atlas_entry(&atlas, 0x41).unwrap();
        let entry = entry.read().unwrap();
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        let bitmap = bitmap.read().unwrap();
        let corner = get_bitmap_pixel(&bitmap, entry.x, entry.y);
        let inside = get_bitmap_pixel(&bitmap, entry.x + 2, entry.y + 2);
        assert_eq!((corner >> 24) & 0xff, 0x41);
        assert_eq!((corner >> 16) & 0xff, 0x80);
        assert_eq!((corner >> 8) & 0xff, 0x40);
        assert_eq!(corner & 0xff, 0xff);
        assert_eq!(inside, corner);
    }

    #[test]
    fn bumps_layout_once_for_each_repack() {
        let mock = mock_rasterizer(|_| (8, 8));
        let mut options = atlas_options(mock.backend, 32, 32);
        options.padding = Some(1);
        let atlas = create_glyph_atlas(&options);
        for codepoint in 65..74 {
            get_glyph_atlas_entry(&atlas, codepoint);
        }
        assert_eq!(get_glyph_atlas_layout_version(&atlas), 0);
        get_glyph_atlas_entry(&atlas, 74);
        assert_eq!(get_glyph_atlas_layout_version(&atlas), 1);
        get_glyph_atlas_entry(&atlas, 75);
        assert_eq!(get_glyph_atlas_layout_version(&atlas), 2);
    }

    #[test]
    fn caches_a_rasterized_glyph_and_returns_the_same_entry_identity() {
        let mock = mock_rasterizer(|_| (8, 8));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 256, 256));
        let first = get_glyph_atlas_entry(&atlas, 65).unwrap();
        let second = get_glyph_atlas_entry(&atlas, 65).unwrap();
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(*mock.calls.lock().unwrap(), vec![65]);
    }

    #[test]
    fn does_not_repack_when_count_budget_eviction_leaves_append_space() {
        let mock = mock_rasterizer(|_| (8, 8));
        let mut options = atlas_options(mock.backend, 256, 256);
        options.max_glyphs = Some(2);
        let atlas = create_glyph_atlas(&options);
        get_glyph_atlas_entry(&atlas, 65);
        get_glyph_atlas_entry(&atlas, 66);
        get_glyph_atlas_entry(&atlas, 67);
        assert_eq!(get_glyph_atlas_layout_version(&atlas), 0);
    }

    #[test]
    fn evicts_strictly_oldest_first_after_interleaved_touches() {
        let mock = mock_rasterizer(|_| (8, 8));
        let mut options = atlas_options(mock.backend, 256, 256);
        options.max_glyphs = Some(3);
        let atlas = create_glyph_atlas(&options);
        get_glyph_atlas_entry(&atlas, 65);
        get_glyph_atlas_entry(&atlas, 66);
        get_glyph_atlas_entry(&atlas, 67);
        get_glyph_atlas_entry(&atlas, 66);
        get_glyph_atlas_entry(&atlas, 65);
        get_glyph_atlas_entry(&atlas, 68);
        get_glyph_atlas_entry(&atlas, 66);
        get_glyph_atlas_entry(&atlas, 65);
        assert_eq!(*mock.calls.lock().unwrap(), vec![65, 66, 67, 68]);
        get_glyph_atlas_entry(&atlas, 67);
        assert_eq!(*mock.calls.lock().unwrap(), vec![65, 66, 67, 68, 67]);
    }

    #[test]
    fn evicts_to_hold_the_occupied_area_budget() {
        let mock = mock_rasterizer(|_| (10, 10));
        let mut options = atlas_options(mock.backend, 256, 256);
        options.max_area = Some(250);
        let atlas = create_glyph_atlas(&options);
        get_glyph_atlas_entry(&atlas, 65);
        get_glyph_atlas_entry(&atlas, 66);
        get_glyph_atlas_entry(&atlas, 67);
        get_glyph_atlas_entry(&atlas, 65);
        assert_eq!(*mock.calls.lock().unwrap(), vec![65, 66, 67, 65]);
    }

    #[test]
    fn evicts_to_hold_the_retained_byte_budget() {
        let mock = mock_rasterizer(|_| (10, 10));
        let mut options = atlas_options(mock.backend, 256, 256);
        options.max_bytes = Some(900);
        let atlas = create_glyph_atlas(&options);
        get_glyph_atlas_entry(&atlas, 65);
        get_glyph_atlas_entry(&atlas, 66);
        get_glyph_atlas_entry(&atlas, 67);
        get_glyph_atlas_entry(&atlas, 65);
        assert_eq!(*mock.calls.lock().unwrap(), vec![65, 66, 67, 65]);
    }

    #[test]
    fn keeps_rectangles_in_bounds_and_non_overlapping() {
        let mock = mock_rasterizer(|codepoint| {
            return (8 + codepoint % 7, 8 + codepoint % 5);
        });
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 256, 256));
        let mut entries = Vec::new();
        for codepoint in 65..75 {
            entries.push(get_glyph_atlas_entry(&atlas, codepoint).unwrap());
        }
        for entry in &entries {
            let entry = entry.read().unwrap();
            assert!(entry.x + entry.width <= 256);
            assert!(entry.y + entry.height <= 256);
        }
        assert_no_overlap(&entries);
    }

    #[test]
    fn keeps_rectangles_non_overlapping_after_eviction_and_repack() {
        let mock = mock_rasterizer(|codepoint| {
            return (8 + codepoint % 4, 8 + codepoint % 6);
        });
        let mut options = atlas_options(mock.backend, 64, 64);
        options.max_glyphs = Some(4);
        let atlas = create_glyph_atlas(&options);
        for codepoint in 65..90 {
            get_glyph_atlas_entry(&atlas, codepoint);
        }
        let entries = (86..90)
            .map(|codepoint| get_glyph_atlas_entry(&atlas, codepoint).unwrap())
            .collect::<Vec<_>>();
        assert_no_overlap(&entries);
    }

    #[test]
    fn leaves_all_budgets_unbounded_when_absent() {
        let mock = mock_rasterizer(|_| (10, 10));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 256, 256));
        for codepoint in 65..85 {
            get_glyph_atlas_entry(&atlas, codepoint);
        }
        get_glyph_atlas_entry(&atlas, 65);
        assert_eq!(mock.calls.lock().unwrap().len(), 20);
    }

    #[test]
    fn passes_size_advance_bearings_and_page_through_to_the_entry() {
        let mock = mock_rasterizer(|codepoint| {
            return (if codepoint == 65 { 12 } else { 6 }, 10);
        });
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 256, 256));
        let entry = get_glyph_atlas_entry(&atlas, 65).unwrap();
        let entry = entry.read().unwrap();
        assert_eq!(entry.width, 12);
        assert_eq!(entry.height, 10);
        assert_eq!(entry.advance, 12.0);
        assert_eq!(entry.bearing_x, 1);
        assert_eq!(entry.bearing_y, 10);
        assert_eq!(entry.page, 0);
    }

    #[test]
    fn places_a_boundary_sized_glyph_inside_the_exact_padding_gutter() {
        let mock = mock_rasterizer(|codepoint| {
            return if codepoint == 65 { (62, 62) } else { (63, 62) };
        });
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 64, 64));
        let entry = get_glyph_atlas_entry(&atlas, 65).unwrap();
        let entry = entry.read().unwrap();
        assert_eq!(
            (entry.x, entry.y, entry.width, entry.height),
            (1, 1, 62, 62)
        );
        assert!(get_glyph_atlas_entry(&atlas, 66).is_none());
    }

    #[test]
    fn places_a_rasterized_again_glyph_at_the_newest_lru_end() {
        let mock = mock_rasterizer(|_| (8, 8));
        let mut options = atlas_options(mock.backend, 256, 256);
        options.max_glyphs = Some(2);
        let atlas = create_glyph_atlas(&options);
        get_glyph_atlas_entry(&atlas, 65);
        get_glyph_atlas_entry(&atlas, 66);
        get_glyph_atlas_entry(&atlas, 67);
        get_glyph_atlas_entry(&atlas, 65);
        get_glyph_atlas_entry(&atlas, 68);
        get_glyph_atlas_entry(&atlas, 65);
        assert_eq!(*mock.calls.lock().unwrap(), vec![65, 66, 67, 65, 68]);
    }

    #[test]
    fn preserves_advance_for_a_present_glyph_with_no_ink() {
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(|_codepoint, _options| {
                return Some(GlyphRasterizedBitmap {
                    advance: 5.0,
                    bearing_x: 0,
                    bearing_y: 0,
                    height: 0,
                    pixels: Vec::new().into_boxed_slice(),
                    width: 0,
                });
            }),
        };
        let atlas = create_glyph_atlas(&atlas_options(backend, 64, 64));
        let entry = get_glyph_atlas_entry(&atlas, 0x20).unwrap();
        let entry = entry.read().unwrap();
        assert_eq!(entry.advance, 5.0);
        assert_eq!(entry.width, 0);
        assert_eq!(entry.height, 0);
    }

    #[test]
    fn produces_a_visible_glyph_with_the_headless_stub_backend() {
        let atlas = create_glyph_atlas(&atlas_options(
            allocate_stub_glyph_rasterizer_backend(),
            256,
            256,
        ));
        let entry = get_glyph_atlas_entry(&atlas, 0x41).unwrap();
        let entry = entry.read().unwrap();
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        let bitmap = bitmap.read().unwrap();
        assert!(entry.width > 0);
        assert!(entry.height > 0);
        assert_eq!(
            get_bitmap_pixel(&bitmap, entry.x + 1, entry.y + 1) & 0xff,
            0xff
        );
    }

    #[test]
    fn returns_null_for_a_glyph_larger_than_the_usable_atlas() {
        let mock = mock_rasterizer(|_| (200, 200));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 64, 64));
        assert!(get_glyph_atlas_entry(&atlas, 65).is_none());
    }

    #[test]
    fn returns_null_when_the_rasterizer_produces_nothing() {
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(|_codepoint, _options| None),
        };
        let atlas = create_glyph_atlas(&atlas_options(backend, 64, 64));
        assert!(get_glyph_atlas_entry(&atlas, 65).is_none());
    }

    #[test]
    fn propagates_the_backend_panic_payload_without_replacing_its_identity() {
        #[derive(Debug)]
        struct BackendFailure;

        let failure = Arc::new(BackendFailure);
        let callback_failure = failure.clone();
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(move |_codepoint, _options| {
                std::panic::panic_any(callback_failure.clone());
            }),
        };
        let atlas = create_glyph_atlas(&atlas_options(backend, 64, 64));
        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            get_glyph_atlas_entry(&atlas, 65);
        }))
        .unwrap_err();
        let caught = caught.downcast::<Arc<BackendFailure>>().unwrap();
        assert!(Arc::ptr_eq(&failure, &caught));
    }

    #[test]
    fn repack_marks_the_full_atlas_dirty_and_reblits_retained_pixels() {
        let mock = mock_rasterizer(|_| (8, 8));
        let mut options = atlas_options(mock.backend, 32, 32);
        options.padding = Some(1);
        let atlas = create_glyph_atlas(&options);
        let mut survivor = None;
        for codepoint in 65..74 {
            let entry = get_glyph_atlas_entry(&atlas, codepoint).unwrap();
            if codepoint == 66 {
                survivor = Some(entry);
            }
        }
        clear_glyph_atlas_dirty(&atlas);
        get_glyph_atlas_entry(&atlas, 74);
        let dirty = get_glyph_atlas_dirty_region(&atlas).unwrap();
        assert_eq!(
            (dirty.x, dirty.y, dirty.width, dirty.height),
            (0.0, 0.0, 32.0, 32.0)
        );
        let survivor = survivor.unwrap();
        let survivor = survivor.read().unwrap();
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        let bitmap = bitmap.read().unwrap();
        assert_eq!(
            (get_bitmap_pixel(&bitmap, survivor.x, survivor.y) >> 24) & 0xff,
            66
        );
    }

    #[test]
    fn updates_a_surviving_entry_in_place_during_repack() {
        let mock = mock_rasterizer(|_| (8, 8));
        let mut options = atlas_options(mock.backend, 32, 32);
        options.padding = Some(1);
        let atlas = create_glyph_atlas(&options);
        for codepoint in 65..74 {
            get_glyph_atlas_entry(&atlas, codepoint);
        }
        for codepoint in 65..73 {
            get_glyph_atlas_entry(&atlas, codepoint);
        }
        let survivor = get_glyph_atlas_entry(&atlas, 65).unwrap();
        let before = {
            let entry = survivor.read().unwrap();
            (entry.x, entry.y)
        };
        get_glyph_atlas_entry(&atlas, 74);
        let after = {
            let entry = survivor.read().unwrap();
            (entry.x, entry.y)
        };
        assert_eq!(before, after);
        assert_eq!(get_glyph_atlas_layout_version(&atlas), 1);
    }

    fn assert_no_overlap(entries: &[flight_entity::Ref<GlyphEntry>]) {
        for index in 0..entries.len() {
            for other_index in index + 1..entries.len() {
                let a = entries[index].read().unwrap();
                let b = entries[other_index].read().unwrap();
                let overlaps = a.x < b.x + b.width
                    && b.x < a.x + a.width
                    && a.y < b.y + b.height
                    && b.y < a.y + a.height;
                assert!(!overlaps);
            }
        }
    }
}

mod set_glyph_atlas_entry_guard {
    use super::*;

    #[test]
    fn reports_typed_reason_and_codepoint_for_a_blocked_lookup() {
        let atlas = create_glyph_atlas(&atlas_options(
            HostGlyphRasterizerCapability {
                measure_metrics: None,
                provider: Arc::new(()),
                rasterize: Arc::new(|_codepoint, _options| None),
            },
            64,
            64,
        ));
        let notices = Arc::new(Mutex::new(Vec::new()));
        let seen = notices.clone();
        set_glyph_atlas_entry_guard(
            &atlas,
            Some(Arc::new(move |notice| {
                seen.lock().unwrap().push(notice.clone());
            })),
        );
        get_glyph_atlas_entry(&atlas, 0x41);
        assert_eq!(
            *notices.lock().unwrap(),
            vec![GlyphAtlasEntryGuardNotice {
                reason: GlyphAtlasEntryGuardReason::RasterizerReturnedNull,
                subject: 0x41,
                repack_count: 0,
            }]
        );
    }

    #[test]
    fn stays_silent_for_success_and_stops_after_clear() {
        let mock = mock_rasterizer(|_| (200, 8));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 64, 64));
        let calls = Arc::new(Mutex::new(Vec::new()));
        let seen = calls.clone();
        set_glyph_atlas_entry_guard(
            &atlas,
            Some(Arc::new(move |notice| {
                seen.lock().unwrap().push(notice.reason);
            })),
        );
        get_glyph_atlas_entry(&atlas, 65);
        set_glyph_atlas_entry_guard(&atlas, None);
        get_glyph_atlas_entry(&atlas, 66);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![GlyphAtlasEntryGuardReason::GlyphLargerThanAtlas]
        );
    }
}
