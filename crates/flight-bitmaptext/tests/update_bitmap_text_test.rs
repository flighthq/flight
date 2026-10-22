use std::sync::{Arc, Mutex};

use flight_glyphatlas::contract::{
    GlyphAtlasOptions, allocate_stub_glyph_rasterizer_backend,
    create_glyph_source_from_glyph_atlas, get_glyph_atlas_bitmap,
};
use flight_texture::get_texture_source;

use super::*;

fn atlas_regions(text: &BitmapText, page: usize) -> Vec<flight_textureatlas::TextureAtlasRegion> {
    return get_bitmap_text_pages(text)[page]
        .atlas
        .read()
        .unwrap()
        .regions
        .iter()
        .map(|region| region.read().unwrap().clone())
        .collect();
}

fn lookup(source: &flight_entity::Ref<flight_glyphatlas::GlyphSource>, codepoint: u32) {
    let callback = source.read().unwrap().get_glyph_entry.clone();
    callback(codepoint);
}

fn text_with_options(options: BitmapTextOptions) -> flight_entity::Ref<BitmapText> {
    return create_test_bitmap_text(Some(create_test_glyph_source()), Some(&options));
}

mod refresh_bitmap_text_glyph_layout {
    use super::*;

    #[test]
    fn rebakes_regions_after_repack_reuses_their_pixels() {
        let atlas = create_repacking_glyph_atlas();
        let source = create_glyph_source_from_glyph_atlas(&atlas);
        let text = create_test_bitmap_text(Some(source.clone()), Some(&bitmap_text_options("A")));
        layout(&text, &guard_state());

        let baked = atlas_regions(&text.read().unwrap(), 0)[0].clone();
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        assert_eq!(
            read_glyph_codepoint_at_region(&bitmap, baked.x, baked.y),
            0x41
        );
        for codepoint in 0x42..=0x5a {
            lookup(&source, codepoint);
        }
        assert!(is_bitmap_text_glyph_layout_stale(&text.read().unwrap()));
        assert_ne!(
            read_glyph_codepoint_at_region(&bitmap, baked.x, baked.y),
            0x41
        );

        assert!(refresh_bitmap_text_glyph_layout(
            &mut text.write().unwrap(),
            &guard_state(),
        ));
        let rebaked = atlas_regions(&text.read().unwrap(), 0)[0].clone();
        assert_eq!(
            read_glyph_codepoint_at_region(&bitmap, rebaked.x, rebaked.y),
            0x41
        );
        assert!(!is_bitmap_text_glyph_layout_stale(&text.read().unwrap()));
    }

    #[test]
    fn does_nothing_when_placement_has_not_moved() {
        let atlas = create_repacking_glyph_atlas();
        let source = create_glyph_source_from_glyph_atlas(&atlas);
        let text = create_test_bitmap_text(Some(source), Some(&bitmap_text_options("A")));
        layout(&text, &guard_state());
        let before = atlas_regions(&text.read().unwrap(), 0)[0].clone();
        assert!(!refresh_bitmap_text_glyph_layout(
            &mut text.write().unwrap(),
            &guard_state(),
        ));
        assert_eq!(atlas_regions(&text.read().unwrap(), 0)[0], before);
    }

    #[test]
    fn lays_out_a_never_laid_out_node() {
        let atlas = create_repacking_glyph_atlas();
        let source = create_glyph_source_from_glyph_atlas(&atlas);
        let text = create_test_bitmap_text(Some(source), Some(&bitmap_text_options("A")));
        assert!(refresh_bitmap_text_glyph_layout(
            &mut text.write().unwrap(),
            &guard_state(),
        ));
        assert_eq!(
            get_bitmap_text_pages(&text.read().unwrap())[0].instance_count,
            1
        );
    }

    #[test]
    fn repairs_every_node_sharing_the_atlas() {
        let atlas = create_repacking_glyph_atlas();
        let source = create_glyph_source_from_glyph_atlas(&atlas);
        let first = create_test_bitmap_text(Some(source.clone()), Some(&bitmap_text_options("A")));
        layout(&first, &guard_state());
        let second = create_test_bitmap_text(
            Some(source),
            Some(&bitmap_text_options("BCDEFGHIJKLMNOPQRSTUVWXYZ")),
        );
        layout(&second, &guard_state());
        assert!(is_bitmap_text_glyph_layout_stale(&first.read().unwrap()));
        refresh_bitmap_text_glyph_layout(&mut first.write().unwrap(), &guard_state());
        let region = atlas_regions(&first.read().unwrap(), 0)[0].clone();
        assert_eq!(
            read_glyph_codepoint_at_region(&get_glyph_atlas_bitmap(&atlas), region.x, region.y),
            0x41,
        );
    }
}

mod set_bitmap_text_layout_guard {
    use super::*;

    #[test]
    fn reports_reason_and_pass_count_when_layout_cannot_settle() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let guard_seen = seen.clone();
        let mut guards = guard_state();
        set_bitmap_text_layout_guard(
            &mut guards,
            Some(Arc::new(move |reason, attempts| {
                guard_seen
                    .lock()
                    .unwrap()
                    .push((reason.to_string(), attempts));
            })),
        );
        let source = create_glyph_source_from_glyph_atlas(&create_repacking_glyph_atlas());
        let text = create_test_bitmap_text(
            Some(source),
            Some(&bitmap_text_options("ABCDEFGHIJKLMNOPQRSTUVWXYZ")),
        );
        layout(&text, &guards);
        assert_eq!(
            *seen.lock().unwrap(),
            vec![("layout-did-not-converge".to_string(), 3)],
        );
    }

    #[test]
    fn stays_silent_for_a_settled_layout() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let guard_seen = seen.clone();
        let mut guards = guard_state();
        set_bitmap_text_layout_guard(
            &mut guards,
            Some(Arc::new(move |reason, _attempts| {
                guard_seen.lock().unwrap().push(reason.to_string());
            })),
        );
        let source = create_glyph_source_from_glyph_atlas(&create_repacking_glyph_atlas());
        layout(
            &create_test_bitmap_text(Some(source), Some(&bitmap_text_options("AB"))),
            &guards,
        );
        assert!(seen.lock().unwrap().is_empty());
    }

    #[test]
    fn stops_reporting_after_clear() {
        let calls = Arc::new(Mutex::new(0));
        let guard_calls = calls.clone();
        let mut guards = guard_state();
        set_bitmap_text_layout_guard(
            &mut guards,
            Some(Arc::new(move |_reason, _attempts| {
                *guard_calls.lock().unwrap() += 1;
            })),
        );
        let source = create_glyph_source_from_glyph_atlas(&create_repacking_glyph_atlas());
        layout(
            &create_test_bitmap_text(
                Some(source.clone()),
                Some(&bitmap_text_options("ABCDEFGHIJKLMNOPQRSTUVWXYZ")),
            ),
            &guards,
        );
        set_bitmap_text_layout_guard(&mut guards, None);
        layout(
            &create_test_bitmap_text(
                Some(source),
                Some(&bitmap_text_options("ABCDEFGHIJKLMNOPQRSTUVWXYZ")),
            ),
            &guards,
        );
        assert_eq!(*calls.lock().unwrap(), 1);
    }
}

mod set_bitmap_text_missing_glyph_guard {
    use super::*;

    #[test]
    fn fires_for_each_missing_codepoint() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let guard_seen = seen.clone();
        let mut guards = guard_state();
        set_bitmap_text_missing_glyph_guard(
            &mut guards,
            Some(Arc::new(move |codepoint| {
                guard_seen.lock().unwrap().push(codepoint);
            })),
        );
        layout(&text_with_options(bitmap_text_options("AC")), &guards);
        assert_eq!(*seen.lock().unwrap(), vec![0x43]);
    }

    #[test]
    fn stays_silent_when_all_codepoints_have_glyphs() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let guard_seen = seen.clone();
        let mut guards = guard_state();
        set_bitmap_text_missing_glyph_guard(
            &mut guards,
            Some(Arc::new(move |codepoint| {
                guard_seen.lock().unwrap().push(codepoint);
            })),
        );
        layout(&text_with_options(bitmap_text_options("AB")), &guards);
        assert!(seen.lock().unwrap().is_empty());
    }
}

mod update_bitmap_text {
    use super::*;

    #[test]
    fn reruns_when_glyph_placement_moves_mid_layout() {
        let source = create_mid_layout_relocating_glyph_source(2);
        let text = create_test_bitmap_text(Some(source), Some(&bitmap_text_options("ABC")));
        update_bitmap_text(&mut text.write().unwrap(), &guard_state());
        assert_eq!(
            atlas_regions(&text.read().unwrap(), 0)[0].x,
            RELOCATED_GLYPH_X as f32
        );
        assert!(!is_bitmap_text_glyph_layout_stale(&text.read().unwrap()));
    }

    #[test]
    fn does_not_rerun_when_placement_holds_still() {
        let source = create_mid_layout_relocating_glyph_source(0);
        let text = create_test_bitmap_text(Some(source), Some(&bitmap_text_options("ABC")));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let guard_seen = seen.clone();
        let guards = BitmapTextGuardState {
            layout_guard: Some(Arc::new(move |reason, _attempts| {
                guard_seen.lock().unwrap().push(reason.to_string());
            })),
            ..guard_state()
        };
        layout(&text, &guards);
        assert_eq!(atlas_regions(&text.read().unwrap(), 0)[0].x, 0.0);
        assert!(seen.lock().unwrap().is_empty());
    }

    #[test]
    fn remains_coherent_through_a_real_mid_layout_repack() {
        let atlas = create_repacking_glyph_atlas();
        let source = create_glyph_source_from_glyph_atlas(&atlas);
        for codepoint in 0x61..=0x66 {
            lookup(&source, codepoint);
        }
        let text = create_test_bitmap_text(Some(source), Some(&bitmap_text_options("ABCDEF")));
        layout(&text, &guard_state());
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert!(page.instance_count > 0);
        let regions: Vec<_> = page
            .atlas
            .read()
            .unwrap()
            .regions
            .iter()
            .map(|region| region.read().unwrap().clone())
            .collect();
        for (id, region) in regions.iter().enumerate() {
            assert_eq!(
                read_glyph_codepoint_at_region(&bitmap, region.x, region.y),
                0x41 + id as u8,
            );
        }
        assert!(!is_bitmap_text_glyph_layout_stale(&text));
    }

    #[test]
    fn emits_quads_from_a_stub_fed_atlas() {
        let atlas = flight_glyphatlas::create_glyph_atlas(&GlyphAtlasOptions {
            font_family: "unavailable".to_string(),
            font_size: 24.0,
            font_style: None,
            font_weight: None,
            height: 256,
            max_area: None,
            max_bytes: None,
            max_glyphs: None,
            padding: None,
            rasterizer_backend: allocate_stub_glyph_rasterizer_backend(),
            width: 256,
        });
        let source = create_glyph_source_from_glyph_atlas(&atlas);
        let text = create_test_bitmap_text(Some(source), Some(&bitmap_text_options("Hi")));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        assert!(!get_bitmap_text_pages(&text).is_empty());
        assert_eq!(get_bitmap_text_pages(&text)[0].instance_count, 2);
    }

    #[test]
    fn places_glyphs_at_cumulative_advance_with_kerning() {
        let text = text_with_options(bitmap_text_options("AB"));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert_eq!(page.instance_count, 2);
        assert_eq!(&page.transforms[..4], &[0.0, 0.0, 8.0, 0.0]);
    }

    #[test]
    fn builds_one_region_per_distinct_glyph_and_references_ids() {
        let text = text_with_options(bitmap_text_options("AB"));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert_eq!(page.atlas.read().unwrap().regions.len(), 2);
        assert_eq!(&page.ids[..2], &[0, 1]);
        let regions: Vec<_> = page
            .atlas
            .read()
            .unwrap()
            .regions
            .iter()
            .map(|region| region.read().unwrap().clone())
            .collect();
        assert_eq!((regions[0].x, regions[1].x), (0.0, 6.0));
    }

    #[test]
    fn reuses_a_region_for_repeated_codepoints() {
        let text = text_with_options(bitmap_text_options("AA"));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert_eq!(page.instance_count, 2);
        assert_eq!(page.atlas.read().unwrap().regions.len(), 1);
        assert_eq!(&page.ids[..2], &[0, 0]);
    }

    #[test]
    fn starts_explicit_newline_at_metric_advance() {
        let text = text_with_options(bitmap_text_options("A\nB"));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        assert_eq!(
            &get_bitmap_text_pages(&text)[0].transforms[..4],
            &[0.0, 0.0, 0.0, 10.0]
        );
    }

    #[test]
    fn scales_line_advance_by_line_height() {
        let text = text_with_options(BitmapTextOptions {
            line_height: Some(2.0),
            text: Some("A\nB".to_string()),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        assert_eq!(
            get_bitmap_text_pages(&text.read().unwrap())[0].transforms[3],
            20.0
        );
    }

    #[test]
    fn wraps_at_word_boundary_when_width_is_exceeded() {
        let text = text_with_options(BitmapTextOptions {
            text: Some("AA AA".to_string()),
            wrap_width: Some(Some(30.0)),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert_eq!(page.instance_count, 4);
        assert_eq!(
            (0..4)
                .filter(|index| page.transforms[index * 2 + 1] == 0.0)
                .count(),
            2,
        );
        assert_eq!(
            (0..4)
                .filter(|index| page.transforms[index * 2 + 1] == 10.0)
                .count(),
            2,
        );
    }

    #[test]
    fn keeps_words_on_one_line_and_honors_space_advance_without_wrap() {
        let text = text_with_options(bitmap_text_options("AA AA"));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert_eq!(page.instance_count, 4);
        assert!((0..4).all(|index| page.transforms[index * 2 + 1] == 0.0));
        assert_eq!((page.transforms[4], page.transforms[6]), (25.0, 35.0));
    }

    #[test]
    fn offsets_center_aligned_line() {
        let text = text_with_options(BitmapTextOptions {
            align: Some(BitmapTextAlign::Center),
            text: Some("AB".to_string()),
            wrap_width: Some(Some(100.0)),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert_eq!((page.transforms[0], page.transforms[2]), (41.0, 49.0));
    }

    #[test]
    fn offsets_right_aligned_line() {
        let text = text_with_options(BitmapTextOptions {
            align: Some(BitmapTextAlign::Right),
            text: Some("AB".to_string()),
            wrap_width: Some(Some(100.0)),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        assert_eq!(
            get_bitmap_text_pages(&text.read().unwrap())[0].transforms[0],
            82.0
        );
    }

    #[test]
    fn stretches_justify_gaps_only_on_nonfinal_lines() {
        let text = text_with_options(BitmapTextOptions {
            align: Some(BitmapTextAlign::Justify),
            text: Some("AA AA AA".to_string()),
            wrap_width: Some(Some(50.0)),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert_eq!((page.transforms[4], page.transforms[6]), (30.0, 40.0));
        let line_one: Vec<f32> = (0..page.instance_count)
            .filter(|index| page.transforms[index * 2 + 1] == 10.0)
            .map(|index| page.transforms[index * 2])
            .collect();
        assert_eq!(line_one, vec![0.0, 10.0]);
    }

    #[test]
    fn omits_missing_glyph_without_quad_or_advance() {
        let text = text_with_options(bitmap_text_options("A?B"));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert_eq!(page.instance_count, 2);
        assert_eq!((page.transforms[0], page.transforms[2]), (0.0, 8.0));
    }

    #[test]
    fn adds_letter_spacing_after_each_advance() {
        let text = text_with_options(BitmapTextOptions {
            letter_spacing: Some(1.0),
            text: Some("AB".to_string()),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        assert_eq!(
            get_bitmap_text_pages(&text.read().unwrap())[0].transforms[2],
            9.0
        );
    }

    #[test]
    fn lays_out_empty_text_as_an_empty_page() {
        let text = text_with_options(bitmap_text_options(""));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        assert_eq!(get_bitmap_text_pages(&text)[0].instance_count, 0);
        let bounds = get_bitmap_text_bounds(&text);
        assert_eq!((bounds.width, bounds.height), (0.0, 0.0));
    }

    #[test]
    fn reports_bounds_covering_glyph_extent() {
        let text = text_with_options(bitmap_text_options("AB"));
        layout(&text, &guard_state());
        let bounds = get_bitmap_text_bounds(&text.read().unwrap());
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (0.0, 0.0, 14.0, 8.0)
        );
    }

    #[test]
    fn binds_single_page_to_page_zero_image() {
        let source = create_test_glyph_source();
        let expected = {
            let callback = source.read().unwrap().get_glyph_atlas_image.clone();
            callback(Some(0)).unwrap()
        };
        let text = create_test_bitmap_text(Some(source), Some(&bitmap_text_options("AB")));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let pages = get_bitmap_text_pages(&text);
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].instance_count, 2);
        let texture = pages[0].atlas.read().unwrap().texture.clone().unwrap();
        let actual = get_texture_source(&*texture.read().unwrap()).unwrap();
        assert_eq!(
            Arc::as_ptr(&actual) as *const (),
            Arc::as_ptr(&expected) as *const ()
        );
    }

    #[test]
    fn partitions_glyphs_into_distinct_source_pages() {
        let (source, page_zero_image, page_one_image) = create_two_page_glyph_source();
        let text = create_test_bitmap_text(Some(source), Some(&bitmap_text_options("AB")));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let pages = get_bitmap_text_pages(&text);
        assert_eq!(pages.len(), 2);
        assert_eq!((pages[0].instance_count, pages[1].instance_count), (1, 1));
        let texture_zero = pages[0].atlas.read().unwrap().texture.clone().unwrap();
        let texture_one = pages[1].atlas.read().unwrap().texture.clone().unwrap();
        let actual_zero = get_texture_source(&*texture_zero.read().unwrap()).unwrap();
        let actual_one = get_texture_source(&*texture_one.read().unwrap()).unwrap();
        assert_eq!(
            Arc::as_ptr(&actual_zero) as *const (),
            Arc::as_ptr(&page_zero_image) as *const (),
        );
        assert_eq!(
            Arc::as_ptr(&actual_one) as *const (),
            Arc::as_ptr(&page_one_image) as *const (),
        );
        assert_eq!(
            pages[0].atlas.read().unwrap().regions[0].read().unwrap().x,
            0.0
        );
        assert_eq!(
            pages[1].atlas.read().unwrap().regions[0].read().unwrap().x,
            3.0
        );
        assert_eq!(pages[0].transforms[0], 0.0);
        assert_eq!(pages[1].transforms[0], 10.0);
    }

    #[test]
    fn spans_all_pages_when_computing_bounds() {
        let (source, _page_zero, _page_one) = create_two_page_glyph_source();
        let text = create_test_bitmap_text(Some(source), Some(&bitmap_text_options("AB")));
        layout(&text, &guard_state());
        let bounds = get_bitmap_text_bounds(&text.read().unwrap());
        assert_eq!((bounds.x, bounds.width, bounds.height), (0.0, 16.0, 8.0));
    }

    #[test]
    fn limits_visible_lines_to_max_lines() {
        let text = text_with_options(BitmapTextOptions {
            max_lines: Some(Some(2)),
            text: Some("A\nB\nA".to_string()),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        assert_eq!(get_bitmap_text_line_count(&text), 2);
        assert!(is_bitmap_text_truncated(&text));
        assert_eq!(get_bitmap_text_pages(&text)[0].instance_count, 2);
    }

    #[test]
    fn does_not_truncate_when_lines_fit_max_lines() {
        let text = text_with_options(BitmapTextOptions {
            max_lines: Some(Some(3)),
            text: Some("A\nB".to_string()),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        assert_eq!(get_bitmap_text_line_count(&text), 2);
        assert!(!is_bitmap_text_truncated(&text));
        assert_eq!(get_bitmap_text_pages(&text)[0].instance_count, 2);
    }

    #[test]
    fn truncates_wrapped_lines_at_max_lines() {
        let text = text_with_options(BitmapTextOptions {
            max_lines: Some(Some(2)),
            text: Some("AA AA AA".to_string()),
            wrap_width: Some(Some(30.0)),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        assert_eq!(get_bitmap_text_line_count(&text), 2);
        assert!(is_bitmap_text_truncated(&text));
    }

    #[test]
    fn appends_ellipsis_glyphs_to_last_visible_line() {
        let text = text_with_options(BitmapTextOptions {
            ellipsis: Some("B".to_string()),
            max_lines: Some(Some(1)),
            text: Some("A\nB\nA".to_string()),
            ..empty_bitmap_text_options()
        });
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        assert_eq!(get_bitmap_text_pages(&text)[0].instance_count, 2);
        assert!(is_bitmap_text_truncated(&text));
    }

    #[test]
    fn treats_tab_as_a_whitespace_break() {
        let text = text_with_options(bitmap_text_options("A\tB"));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert_eq!(page.instance_count, 2);
        assert_eq!(page.transforms[0], 0.0);
        assert!(page.transforms[2] > 0.0);
    }

    #[test]
    fn treats_nonbreaking_space_as_a_whitespace_break() {
        let text = text_with_options(bitmap_text_options("A\u{00a0}B"));
        layout(&text, &guard_state());
        assert_eq!(
            get_bitmap_text_pages(&text.read().unwrap())[0].instance_count,
            2
        );
    }

    #[test]
    fn sets_line_count_to_zero_for_empty_text() {
        let text = text_with_options(bitmap_text_options(""));
        layout(&text, &guard_state());
        let text = text.read().unwrap();
        assert_eq!(get_bitmap_text_line_count(&text), 0);
        assert!(!is_bitmap_text_truncated(&text));
    }

    #[test]
    fn reports_line_count_for_multiline_text() {
        let text = text_with_options(bitmap_text_options("A\nB\nA\nB"));
        layout(&text, &guard_state());
        assert_eq!(get_bitmap_text_line_count(&text.read().unwrap()), 4);
    }
}
