use std::sync::{Arc, Mutex};

use flight_entity::allocate_entity;

use super::*;

mod create_bitmap_font {
    use super::*;

    #[test]
    fn builds_glyph_and_kerning_lookups_from_plain_data() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        let font_read = font.read().unwrap();
        assert_eq!(font_read.glyphs.len(), 3);
        assert_eq!(font_read.kerning.len(), 1);
        drop(font_read);
        let glyph = get_bitmap_font_glyph(&font, 65).unwrap();
        assert_eq!(glyph.read().unwrap().advance, 9.0);
        assert_eq!(glyph.read().unwrap().page, 0);
    }

    #[test]
    fn defaults_encoding_and_carries_explicit_encoding() {
        let state = guard_state();
        let raster = create_bitmap_font(&state, &font_data());
        let mut data = font_data();
        data.encoding = Some(BitmapFontEncoding::Msdf);
        let msdf = create_bitmap_font(&state, &data);
        assert_eq!(raster.read().unwrap().encoding, BitmapFontEncoding::Raster);
        assert_eq!(msdf.read().unwrap().encoding, BitmapFontEncoding::Msdf);
    }

    #[test]
    fn assigns_declared_pages_and_defaults_an_omitted_page_to_zero() {
        let mut data = font_data();
        data.glyphs = vec![glyph(65, 7, 8, Some(1)), glyph(66, 7, 8, None)];
        data.pages = vec![page(), page()];
        let font = create_bitmap_font(&guard_state(), &data);
        assert_eq!(
            get_bitmap_font_glyph(&font, 65)
                .unwrap()
                .read()
                .unwrap()
                .page,
            1
        );
        assert_eq!(
            get_bitmap_font_glyph(&font, 66)
                .unwrap()
                .read()
                .unwrap()
                .page,
            0
        );
    }

    #[test]
    fn clamps_out_of_range_pages_without_dropping_the_glyph() {
        let mut data = font_data();
        data.glyphs = vec![glyph(65, 7, 8, Some(5)), glyph(66, 7, 8, Some(-1))];
        let font = create_bitmap_font(&guard_state(), &data);
        assert_eq!(
            get_bitmap_font_glyph(&font, 65)
                .unwrap()
                .read()
                .unwrap()
                .page,
            0
        );
        assert_eq!(
            get_bitmap_font_glyph(&font, 66)
                .unwrap()
                .read()
                .unwrap()
                .page,
            0
        );
    }

    #[test]
    fn copies_metrics_but_preserves_page_identity() {
        let data = font_data();
        let authored_metrics = data.metrics;
        let authored_page = data.pages[0].clone();
        let font = create_bitmap_font(&guard_state(), &data);
        let metrics = get_bitmap_font_metrics(&font);
        assert_eq!(authored_metrics, *metrics);
        assert!(Arc::ptr_eq(
            &authored_page,
            &get_bitmap_font_page(&font, None).unwrap()
        ));
    }

    #[test]
    fn duplicate_codepoints_keep_the_last_value_and_one_map_slot() {
        let mut data = font_data();
        data.glyphs = vec![glyph(65, 3, 4, None), glyph(65, 9, 10, None)];
        let font = create_bitmap_font(&guard_state(), &data);
        assert_eq!(font.read().unwrap().glyphs.len(), 1);
        let entry = get_bitmap_font_glyph(&font, 65).unwrap();
        assert_eq!(entry.read().unwrap().width, 9);
    }
}

mod create_bitmap_font_guard_state {
    use super::*;

    #[test]
    fn creates_isolated_caller_owned_guard_slots() {
        let left = create_bitmap_font_guard_state();
        let right = create_bitmap_font_guard_state();
        let guard: BitmapFontGuard = Arc::new(|_, _, _| {});
        set_bitmap_font_guard(&left, Some(guard.clone()));
        assert!(left.read().unwrap().guard.is_some());
        assert!(Arc::ptr_eq(
            left.read().unwrap().guard.as_ref().unwrap(),
            &guard
        ));
        assert!(right.read().unwrap().guard.is_none());
    }
}

mod get_bitmap_font_glyph {
    use super::*;

    #[test]
    fn returns_present_entries_and_none_for_absent_codepoints() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        assert_eq!(
            get_bitmap_font_glyph(&font, 66)
                .unwrap()
                .read()
                .unwrap()
                .advance,
            9.0
        );
        assert!(get_bitmap_font_glyph(&font, 0x1f600).is_none());
    }

    #[test]
    fn returns_the_same_entry_identity_across_repeated_lookups() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        let first = get_bitmap_font_glyph(&font, 65).unwrap();
        let second = get_bitmap_font_glyph(&font, 65).unwrap();
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod get_bitmap_font_kerning {
    use super::*;

    #[test]
    fn returns_the_pair_amount_and_zero_for_an_absent_pair() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        assert_eq!(get_bitmap_font_kerning(&font, 65, 86), -2.0);
        assert_eq!(get_bitmap_font_kerning(&font, 86, 65), 0.0);
    }

    #[test]
    fn keeps_supplementary_plane_pairs_distinct() {
        let mut data = font_data();
        data.kerning = Some(vec![
            BitmapFontKerningData {
                amount: -4.0,
                left: 0xf600,
                right: 65,
            },
            BitmapFontKerningData {
                amount: -9.0,
                left: 0x1f600,
                right: 65,
            },
            BitmapFontKerningData {
                amount: -3.0,
                left: 65,
                right: 0x10041,
            },
            BitmapFontKerningData {
                amount: -7.0,
                left: 66,
                right: 0x41,
            },
        ]);
        let font = create_bitmap_font(&guard_state(), &data);
        assert_eq!(get_bitmap_font_kerning(&font, 0xf600, 65), -4.0);
        assert_eq!(get_bitmap_font_kerning(&font, 0x1f600, 65), -9.0);
        assert_eq!(get_bitmap_font_kerning(&font, 65, 0x10041), -3.0);
        assert_eq!(get_bitmap_font_kerning(&font, 66, 0x41), -7.0);
    }

    #[test]
    fn addresses_the_last_unicode_codepoint() {
        let mut data = font_data();
        data.kerning = Some(vec![BitmapFontKerningData {
            amount: -5.0,
            left: 0x10ffff,
            right: 0x10ffff,
        }]);
        let font = create_bitmap_font(&guard_state(), &data);
        assert_eq!(get_bitmap_font_kerning(&font, 0x10ffff, 0x10ffff), -5.0);
        assert_eq!(get_bitmap_font_kerning(&font, 0x10000, 65), 0.0);
    }
}

mod get_bitmap_font_metrics {
    use super::*;

    #[test]
    fn returns_the_font_line_metrics_with_stable_identity() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        let first = get_bitmap_font_metrics(&font);
        let second = get_bitmap_font_metrics(&font);
        assert_eq!(first.ascent, 8.0);
        assert_eq!(first.descent, 2.0);
        assert_eq!(first.line_gap, 1.0);
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod get_bitmap_font_page {
    use super::*;

    #[test]
    fn returns_pages_by_index_and_none_out_of_range() {
        let first = page();
        let second = page();
        let mut data = font_data();
        data.pages = vec![first.clone(), second.clone()];
        let font = create_bitmap_font(&guard_state(), &data);
        assert!(Arc::ptr_eq(
            &get_bitmap_font_page(&font, None).unwrap(),
            &first
        ));
        assert!(Arc::ptr_eq(
            &get_bitmap_font_page(&font, Some(0)).unwrap(),
            &first
        ));
        assert!(Arc::ptr_eq(
            &get_bitmap_font_page(&font, Some(1)).unwrap(),
            &second
        ));
        assert!(get_bitmap_font_page(&font, Some(-1)).is_none());
        assert!(get_bitmap_font_page(&font, Some(2)).is_none());
    }
}

mod get_bitmap_font_pages {
    use super::*;

    #[test]
    fn returns_a_detached_list_with_the_authored_page_identities() {
        let first = page();
        let second = page();
        let mut data = font_data();
        data.pages = vec![first.clone(), second.clone()];
        let font = create_bitmap_font(&guard_state(), &data);
        let pages = get_bitmap_font_pages(&font);
        assert_eq!(pages.len(), 2);
        assert!(Arc::ptr_eq(&pages[0], &first));
        assert!(Arc::ptr_eq(&pages[1], &second));
    }
}

mod has_bitmap_font_glyph {
    use super::*;

    #[test]
    fn reports_coverage_and_agrees_with_the_lookup_sentinel() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        for codepoint in [65, 66, 86, 0, 67, 0x10000] {
            assert_eq!(
                has_bitmap_font_glyph(&font, codepoint),
                get_bitmap_font_glyph(&font, codepoint).is_some()
            );
        }
    }
}

mod initialize_bitmap_font {
    use super::*;

    #[test]
    fn initializes_a_caller_allocated_entity_like_the_constructor() {
        let mut out: BitmapFont = allocate_entity();
        initialize_bitmap_font(&mut out, &guard_state(), &font_data());
        assert_eq!(out.glyphs.len(), 3);
        assert_eq!(out.kerning.len(), 1);
        assert_eq!(out.encoding, BitmapFontEncoding::Raster);
    }
}

mod pack_bitmap_font_kerning_key {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn gives_distinct_pairs_distinct_full_unicode_keys() {
        let pairs = [
            (65, 86),
            (0, 65),
            (0x10000, 65),
            (0x1f600, 0xf600),
            (0xf600, 0x1f600),
            (0x10ffff, 0x10ffff),
        ];
        let keys: HashSet<_> = pairs
            .into_iter()
            .map(|(left, right)| pack_bitmap_font_kerning_key(left, right))
            .collect();
        assert_eq!(keys.len(), pairs.len());
    }

    #[test]
    fn keeps_the_largest_pair_inside_the_exact_u64_lane() {
        assert_eq!(
            pack_bitmap_font_kerning_key(0x10ffff, 0x10ffff),
            0x10ffff_u64 * 0x110000 + 0x10ffff
        );
    }
}

mod set_bitmap_font_guard {
    use super::*;

    #[test]
    fn reports_the_exact_repair_and_can_be_uninstalled() {
        let state = guard_state();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let record = calls.clone();
        set_bitmap_font_guard(
            &state,
            Some(Arc::new(move |reason, codepoint, page| {
                record.lock().unwrap().push((reason, codepoint, page));
            })),
        );
        let mut data = font_data();
        data.glyphs = vec![glyph(0x41, 7, 8, Some(7))];
        create_bitmap_font(&state, &data);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(BitmapFontGuardReason::PageOutOfRange, 0x41, 7)]
        );
        set_bitmap_font_guard(&state, None);
        create_bitmap_font(&state, &data);
        assert_eq!(calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn stays_quiet_for_a_page_that_exists() {
        let state = guard_state();
        let calls = Arc::new(Mutex::new(0));
        let record = calls.clone();
        set_bitmap_font_guard(
            &state,
            Some(Arc::new(move |_, _, _| *record.lock().unwrap() += 1)),
        );
        create_bitmap_font(&state, &font_data());
        assert_eq!(*calls.lock().unwrap(), 0);
    }
}

mod unpack_bitmap_font_kerning_key {
    use super::*;

    #[test]
    fn recovers_pairs_across_the_full_unicode_space() {
        let pairs = [
            (65, 86),
            (0, 0),
            (0x41, 0x10ffff),
            (0x1f600, 0x41),
            (0x4e00, 0x4e8c),
            (0x10ffff, 0x10ffff),
        ];
        let mut out = BitmapFontKerningPair { left: 0, right: 0 };
        for (left, right) in pairs {
            unpack_bitmap_font_kerning_key(&mut out, pack_bitmap_font_kerning_key(left, right));
            assert_eq!(out, BitmapFontKerningPair { left, right });
        }
    }

    #[test]
    fn overwrites_the_reused_out_record_without_carrying_state() {
        let mut out = BitmapFontKerningPair { left: 0, right: 0 };
        unpack_bitmap_font_kerning_key(&mut out, pack_bitmap_font_kerning_key(0x10ffff, 0x10ffff));
        unpack_bitmap_font_kerning_key(&mut out, pack_bitmap_font_kerning_key(0, 0));
        assert_eq!(out, BitmapFontKerningPair { left: 0, right: 0 });
    }
}
