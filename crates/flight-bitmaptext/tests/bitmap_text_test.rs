use std::sync::Arc;

use flight_geometry::create_rectangle;
use flight_node::Node;

use super::*;

fn text_with(value: &str) -> flight_entity::Ref<BitmapText> {
    return create_bitmap_text(
        Some(create_test_glyph_source_without_kerning()),
        Some(&bitmap_text_options(value)),
    );
}

mod compute_bitmap_text_local_bounds_rectangle {
    use super::*;

    #[test]
    fn writes_laid_out_extent_into_a_distinct_rectangle() {
        let text = text_with("A");
        layout(&text, &guard_state());
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_bitmap_text_local_bounds_rectangle(&mut out, &text.read().unwrap());
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 6.0, 8.0));
    }

    #[test]
    fn safely_overwrites_an_existing_bounds_rectangle() {
        let text = text_with("A");
        layout(&text, &guard_state());
        let mut out = get_bitmap_text_bounds(&text.read().unwrap());
        compute_bitmap_text_local_bounds_rectangle(&mut out, &text.read().unwrap());
        assert_eq!((out.width, out.height), (6.0, 8.0));
    }

    #[test]
    fn writes_zero_before_first_layout() {
        let text = text_with("");
        let mut out = create_rectangle(1.0, 2.0, 99.0, 4.0);
        compute_bitmap_text_local_bounds_rectangle(&mut out, &text.read().unwrap());
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 0.0, 0.0));
    }
}

mod create_bitmap_text {
    use super::*;

    #[test]
    fn creates_a_leaf_with_one_empty_page() {
        let text = create_bitmap_text(Some(create_test_glyph_source_without_kerning()), None);
        let text = text.read().unwrap();
        assert_eq!(text.node_fields().kind, BITMAP_TEXT_KIND);
        assert_eq!(get_bitmap_text_pages(&text).len(), 1);
        assert!(text.node_runtime().children.is_none());
    }

    #[test]
    fn applies_construction_options() {
        let text = create_bitmap_text(
            Some(create_test_glyph_source_without_kerning()),
            Some(&BitmapTextOptions {
                align: Some(BitmapTextAlign::Center),
                letter_spacing: Some(2.0),
                line_height: Some(1.5),
                text: Some("Hi".to_string()),
                wrap_width: Some(Some(120.0)),
                ..empty_bitmap_text_options()
            }),
        );
        let text = text.read().unwrap();
        assert_eq!(text.data.align, BitmapTextAlign::Center);
        assert_eq!(text.data.letter_spacing, 2.0);
        assert_eq!(text.data.line_height, 1.5);
        assert_eq!(text.data.text, "Hi");
        assert_eq!(text.data.wrap_width, Some(120.0));
    }

    #[test]
    fn binds_the_supplied_glyph_source() {
        let source = create_test_glyph_source_without_kerning();
        let text = create_bitmap_text(Some(source.clone()), None);
        let bound = text.read().unwrap().data.glyph_source.clone().unwrap();
        assert!(Arc::ptr_eq(&source, &bound));
    }
}

mod create_bitmap_text_data {
    use super::*;

    #[test]
    fn defaults_to_left_aligned_empty_unwrapped_text() {
        let data = create_bitmap_text_data(None);
        assert_eq!(data.align, BitmapTextAlign::Left);
        assert_eq!(data.ellipsis, "");
        assert!(data.glyph_source.is_none());
        assert_eq!(data.letter_spacing, 0.0);
        assert_eq!(data.line_height, 1.0);
        assert_eq!(data.max_lines, None);
        assert_eq!(data.text, "");
        assert_eq!(data.wrap_width, None);
    }

    #[test]
    fn honors_provided_overrides() {
        let data = create_bitmap_text_data(Some(&BitmapTextDataOptions {
            align: Some(BitmapTextAlign::Right),
            ellipsis: Some("...".to_string()),
            max_lines: Some(2),
            text: Some("x".to_string()),
            wrap_width: Some(50.0),
            ..empty_bitmap_text_data_options()
        }));
        assert_eq!(data.align, BitmapTextAlign::Right);
        assert_eq!(data.ellipsis, "...");
        assert_eq!(data.max_lines, Some(2));
        assert_eq!(data.text, "x");
        assert_eq!(data.wrap_width, Some(50.0));
    }
}

mod create_bitmap_text_runtime {
    use super::*;

    #[test]
    fn starts_empty_unlaid_out_and_untruncated() {
        let runtime = create_bitmap_text_runtime();
        assert_eq!(runtime.line_count, 0);
        assert!(runtime.local_bounds_rectangle.is_none());
        assert!(runtime.pages.is_empty());
        assert!(!runtime.truncated);
        assert_eq!(runtime.glyph_layout_version, -1);
    }
}

mod get_bitmap_text_bounds {
    use super::*;

    #[test]
    fn covers_the_laid_out_glyphs() {
        let text = text_with("AB");
        layout(&text, &guard_state());
        let bounds = get_bitmap_text_bounds(&text.read().unwrap());
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (0.0, 0.0, 16.0, 8.0)
        );
    }
}

mod get_bitmap_text_line_count {
    use super::*;

    #[test]
    fn returns_zero_before_layout() {
        assert_eq!(
            get_bitmap_text_line_count(&text_with("AB").read().unwrap()),
            0
        );
    }

    #[test]
    fn returns_one_for_single_line_text() {
        let text = text_with("AB");
        layout(&text, &guard_state());
        assert_eq!(get_bitmap_text_line_count(&text.read().unwrap()), 1);
    }

    #[test]
    fn counts_explicit_newlines() {
        let text = text_with("A\nB\nA");
        layout(&text, &guard_state());
        assert_eq!(get_bitmap_text_line_count(&text.read().unwrap()), 3);
    }

    #[test]
    fn counts_wrapped_lines() {
        let options = BitmapTextOptions {
            text: Some("AA AA AA".to_string()),
            wrap_width: Some(Some(30.0)),
            ..empty_bitmap_text_options()
        };
        let text = create_bitmap_text(
            Some(create_test_glyph_source_without_kerning()),
            Some(&options),
        );
        layout(&text, &guard_state());
        assert_eq!(get_bitmap_text_line_count(&text.read().unwrap()), 3);
    }
}

mod get_bitmap_text_pages {
    use super::*;

    #[test]
    fn returns_owned_pages_in_page_order() {
        let text = text_with("");
        let text = text.read().unwrap();
        let pages = get_bitmap_text_pages(&text);
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].instance_count, 0);
    }
}

mod initialize_bitmap_text_data {
    use super::*;

    #[test]
    fn is_the_create_data_initializer() {
        let mut data = create_bitmap_text_data(None);
        initialize_bitmap_text_data(
            &mut data,
            Some(&BitmapTextDataOptions {
                text: Some("initialized".to_string()),
                ..empty_bitmap_text_data_options()
            }),
        );
        assert_eq!(data.text, "initialized");
    }
}

mod is_bitmap_text_glyph_layout_stale {
    use super::*;

    #[test]
    fn is_stale_before_layout_and_settled_afterward() {
        let text = text_with("AB");
        assert!(is_bitmap_text_glyph_layout_stale(&text.read().unwrap()));
        layout(&text, &guard_state());
        assert!(!is_bitmap_text_glyph_layout_stale(&text.read().unwrap()));
    }

    #[test]
    fn is_settled_without_a_glyph_source() {
        let text = create_bitmap_text(None, Some(&bitmap_text_options("AB")));
        assert!(!is_bitmap_text_glyph_layout_stale(&text.read().unwrap()));
    }

    #[test]
    fn does_not_treat_an_equal_version_rebind_as_stale() {
        let text = text_with("AB");
        layout(&text, &guard_state());
        set_bitmap_text_glyph_source(
            &mut text.write().unwrap(),
            Some(create_test_glyph_source_without_kerning()),
        );
        assert!(!is_bitmap_text_glyph_layout_stale(&text.read().unwrap()));
    }
}

mod is_bitmap_text_truncated {
    use super::*;

    #[test]
    fn is_false_before_layout() {
        assert!(!is_bitmap_text_truncated(&text_with("").read().unwrap()));
    }

    #[test]
    fn is_false_without_max_lines() {
        let text = text_with("A\nB\nA");
        layout(&text, &guard_state());
        assert!(!is_bitmap_text_truncated(&text.read().unwrap()));
    }

    #[test]
    fn is_true_when_lines_exceed_max_lines() {
        let options = BitmapTextOptions {
            max_lines: Some(Some(2)),
            text: Some("A\nB\nA".to_string()),
            ..empty_bitmap_text_options()
        };
        let text = create_bitmap_text(Some(create_test_glyph_source()), Some(&options));
        layout(&text, &guard_state());
        assert!(is_bitmap_text_truncated(&text.read().unwrap()));
    }

    #[test]
    fn is_false_when_lines_fit_max_lines() {
        let options = BitmapTextOptions {
            max_lines: Some(Some(3)),
            text: Some("A\nB".to_string()),
            ..empty_bitmap_text_options()
        };
        let text = create_bitmap_text(Some(create_test_glyph_source()), Some(&options));
        layout(&text, &guard_state());
        assert!(!is_bitmap_text_truncated(&text.read().unwrap()));
    }
}

mod reserve_bitmap_text {
    use super::*;

    #[test]
    fn grows_each_page_quad_array_capacity() {
        let text = text_with("");
        reserve_bitmap_text(&mut text.write().unwrap(), 64);
        let text = text.read().unwrap();
        let page = &get_bitmap_text_pages(&text)[0];
        assert!(page.ids.len() >= 64);
        assert!(page.transforms.len() >= 128);
    }
}

mod set_bitmap_text_align {
    use super::*;

    #[test]
    fn mutates_align() {
        let text = text_with("");
        set_bitmap_text_align(&mut text.write().unwrap(), BitmapTextAlign::Justify);
        assert_eq!(text.read().unwrap().data.align, BitmapTextAlign::Justify);
    }
}

mod set_bitmap_text_ellipsis {
    use super::*;

    #[test]
    fn mutates_ellipsis() {
        let text = text_with("");
        set_bitmap_text_ellipsis(&mut text.write().unwrap(), "...");
        assert_eq!(text.read().unwrap().data.ellipsis, "...");
    }
}

mod set_bitmap_text_glyph_source {
    use super::*;

    #[test]
    fn rebinds_the_source() {
        let text = text_with("");
        let next = create_test_glyph_source_without_kerning();
        set_bitmap_text_glyph_source(&mut text.write().unwrap(), Some(next.clone()));
        let bound = text.read().unwrap().data.glyph_source.clone().unwrap();
        assert!(Arc::ptr_eq(&bound, &next));
    }
}

mod set_bitmap_text_letter_spacing {
    use super::*;

    #[test]
    fn mutates_letter_spacing() {
        let text = text_with("");
        set_bitmap_text_letter_spacing(&mut text.write().unwrap(), 3.0);
        assert_eq!(text.read().unwrap().data.letter_spacing, 3.0);
    }
}

mod set_bitmap_text_line_height {
    use super::*;

    #[test]
    fn mutates_line_height() {
        let text = text_with("");
        set_bitmap_text_line_height(&mut text.write().unwrap(), 2.0);
        assert_eq!(text.read().unwrap().data.line_height, 2.0);
    }
}

mod set_bitmap_text_max_lines {
    use super::*;

    #[test]
    fn mutates_and_clears_max_lines() {
        let text = text_with("");
        set_bitmap_text_max_lines(&mut text.write().unwrap(), Some(3));
        assert_eq!(text.read().unwrap().data.max_lines, Some(3));
        set_bitmap_text_max_lines(&mut text.write().unwrap(), None);
        assert_eq!(text.read().unwrap().data.max_lines, None);
    }
}

mod set_bitmap_text_text {
    use super::*;

    #[test]
    fn mutates_text() {
        let text = text_with("");
        set_bitmap_text_text(&mut text.write().unwrap(), "changed");
        assert_eq!(text.read().unwrap().data.text, "changed");
    }
}

mod set_bitmap_text_wrap_width {
    use super::*;

    #[test]
    fn mutates_and_clears_wrap_width() {
        let text = text_with("");
        set_bitmap_text_wrap_width(&mut text.write().unwrap(), Some(200.0));
        assert_eq!(text.read().unwrap().data.wrap_width, Some(200.0));
        set_bitmap_text_wrap_width(&mut text.write().unwrap(), None);
        assert_eq!(text.read().unwrap().data.wrap_width, None);
    }
}
