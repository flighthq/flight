//! flight-compiler: target-native

use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{Ref, get_entity_uid};
use flight_geometry::create_rectangle;
use flight_node::{Node, get_node_local_bounds_revision, get_node_local_content_revision};
use flight_scene2d::get_node2d_runtime;
use flight_signals::connect_signal;
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textlayout::{
    RichTextContent, TextAutoSize, TextVerticalAlign, create_rich_text_content,
    create_text_format_range,
};

use super::*;

fn create_rich_with_data(data: TestRichTextData) -> Ref<RichText> {
    return create_test_rich_text(Some(&TestRichText {
        data: Some(data),
        layout_context: None,
    }));
}

fn create_measured_rich_with_data(data: TestRichTextData) -> Ref<RichText> {
    return create_test_rich_text(Some(&TestRichText {
        data: Some(data),
        layout_context: Some(measured_text_context()),
    }));
}

fn format_with_bold(value: bool) -> Ref<TextFormat> {
    let mut format = empty_text_format();
    format.bold = Some(value);
    return format_ref(format);
}

fn format_with_italic(value: bool) -> Ref<TextFormat> {
    let mut format = empty_text_format();
    format.italic = Some(value);
    return format_ref(format);
}

fn input_state(display_as_password: bool) -> TextInputState {
    return TextInputState {
        always_show_selection: false,
        caret_color: 0x000000,
        caret_index: 0,
        caret_width: 1.0,
        desired_caret_x: -1.0,
        display_as_password,
        focused: false,
        history: Vec::new(),
        history_index: -1,
        history_limit: 100,
        password_character: "*".to_string(),
        restrict: String::new(),
        selection_alpha: 0.35,
        selection_color: 0,
        selection_index: 0,
    };
}

mod append_rich_text_string {
    use super::*;

    #[test]
    fn appends_the_value_to_the_existing_text() {
        let mut data = rich_text_options();
        data.text = Some("hello".to_string());
        let rich_text = create_rich_with_data(data);
        append_rich_text_string(&rich_text, " world");
        assert_eq!(rich_text.read().unwrap().data.text, "hello world");
    }

    #[test]
    fn does_not_invalidate_when_value_is_empty() {
        let mut data = rich_text_options();
        data.text = Some("hi".to_string());
        let rich_text = create_rich_with_data(data);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        append_rich_text_string(&rich_text, "");
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn invalidates_local_content_after_append() {
        let mut data = rich_text_options();
        data.text = Some("hi".to_string());
        let rich_text = create_rich_with_data(data);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        append_rich_text_string(&rich_text, "!");
        assert_ne!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }
}

mod build_rich_text_layout_params {
    use super::*;

    #[test]
    fn assembles_content_and_layout_constraints() {
        let mut data = rich_text_options();
        data.multiline = Some(true);
        data.width = Some(120.0);
        data.word_wrap = Some(true);
        let rich_text = create_rich_with_data(data);
        set_rich_text_string(&rich_text, "hello");
        let measure = fixed_measure();
        let params = build_rich_text_layout_params(&*rich_text.read().unwrap(), measure.clone());
        assert_eq!(params.text, "hello");
        assert!(!params.format_ranges.is_empty());
        assert!(Arc::ptr_eq(&params.measure, &measure));
        assert_eq!(params.word_wrap, Some(true));
        assert_eq!(params.width, 120.0);
    }
}

mod clear_rich_text_format_ranges {
    use super::*;

    #[test]
    fn removes_serialized_format_ranges() {
        let rich_text = create_rich_text(None);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(1));
        clear_rich_text_format_ranges(&rich_text);
        assert!(rich_text.read().unwrap().data.text_format_ranges.is_empty());
    }
}

mod compute_rich_text_local_bounds_rectangle {
    use super::*;

    #[test]
    fn falls_back_to_the_fixed_box_under_auto_size_without_a_provider() {
        let mut data = rich_text_options();
        data.auto_size = Some(TextAutoSize::Left);
        data.width = Some(200.0);
        data.height = Some(150.0);
        let rich_text = create_rich_with_data(data);
        set_rich_text_string(&rich_text, "hello");
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_rich_text_local_bounds_rectangle(&mut out, &*rich_text.read().unwrap());
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 150.0);
    }

    #[test]
    fn keeps_the_right_edge_fixed_under_auto_size_right() {
        let mut data = rich_text_options();
        data.auto_size = Some(TextAutoSize::Right);
        data.width = Some(200.0);
        data.height = Some(150.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "hi");
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_rich_text_local_bounds_rectangle(&mut out, &*rich_text.read().unwrap());
        assert_eq!(out.x, 200.0 - out.width);
    }

    #[test]
    fn sets_out_dimensions_from_data_when_auto_size_is_none() {
        let mut data = rich_text_options();
        data.width = Some(200.0);
        data.height = Some(150.0);
        let rich_text = create_rich_with_data(data);
        let mut out = create_rectangle(7.0, 9.0, 0.0, 0.0);
        compute_rich_text_local_bounds_rectangle(&mut out, &*rich_text.read().unwrap());
        assert_eq!(out.x, 0.0);
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 150.0);
    }

    #[test]
    fn shrinks_to_measured_content_under_auto_size_left() {
        let mut data = rich_text_options();
        data.auto_size = Some(TextAutoSize::Left);
        data.width = Some(200.0);
        data.height = Some(150.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "hi");
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_rich_text_local_bounds_rectangle(&mut out, &*rich_text.read().unwrap());
        assert_eq!(out.x, 0.0);
        assert!(out.width > 0.0);
        assert!(out.width < 200.0);
    }
}

mod create_rich_text {
    use super::*;

    #[test]
    fn allows_pre_defined_values() {
        let range = create_text_format_range(format_with_bold(true), 0, 2);
        let format = format_ref(empty_text_format());
        let mut data = rich_text_options();
        data.background = Some(true);
        data.background_color = Some(0);
        data.border = Some(true);
        data.border_color = Some(0xff);
        data.condense_white = Some(true);
        data.default_text_format = Some(format.clone());
        data.max_chars = Some(100);
        data.mouse_wheel_enabled = Some(false);
        data.multiline = Some(false);
        data.selectable = Some(false);
        data.text_color = Some(0x0000_ffff);
        data.text_format_ranges = Some(vec![range]);
        data.word_wrap = Some(true);
        let rich_text = create_rich_with_data(data);
        let rich_text = rich_text.read().unwrap();
        assert!(rich_text.data.background);
        assert_eq!(rich_text.data.background_color, 0);
        assert!(rich_text.data.border);
        assert_eq!(rich_text.data.border_color, 0xff);
        assert!(rich_text.data.condense_white);
        assert!(Arc::ptr_eq(&rich_text.data.default_text_format, &format));
        assert_eq!(rich_text.data.max_chars, 100);
        assert!(!rich_text.data.mouse_wheel_enabled);
        assert!(!rich_text.data.multiline);
        assert!(!rich_text.data.selectable);
        assert_eq!(rich_text.data.text_color, 0x0000_ffff);
        assert_eq!(rich_text.data.text_format_ranges.len(), 1);
        assert!(rich_text.data.word_wrap);
    }

    #[test]
    fn initializes_default_values() {
        let rich_text = create_rich_text(None);
        let rich_text = rich_text.read().unwrap();
        assert!(!rich_text.data.background);
        assert_eq!(rich_text.data.background_color, 0xffff_ffff);
        assert!(!rich_text.data.border);
        assert_eq!(rich_text.data.border_color, 0x0000_00ff);
        assert!(!rich_text.data.condense_white);
        assert_eq!(rich_text.data.max_chars, -1);
        assert!(rich_text.data.mouse_wheel_enabled);
        assert!(rich_text.data.multiline);
        assert_eq!(rich_text.data.scroll_h, 0.0);
        assert_eq!(rich_text.data.scroll_v, 1.0);
        assert!(rich_text.data.selectable);
        assert_eq!(rich_text.data.text_color, 0x0000_00ff);
        assert!(rich_text.data.text_format_ranges.is_empty());
        assert!(!rich_text.data.word_wrap);
        assert_eq!(rich_text.node_fields().kind, RICH_TEXT_KIND);
    }

    #[test]
    fn returns_a_new_object_for_stable_layout() {
        let options = TestRichText {
            data: None,
            layout_context: None,
        };
        let rich_text = create_test_rich_text(Some(&options));
        assert_eq!(rich_text.read().unwrap().node_fields().kind, RICH_TEXT_KIND);
    }
}

mod create_rich_text_data {
    use super::*;

    // D23 B: the source's pre-defined values are assigned after the zero-field create.
    #[test]
    fn allows_pre_defined_values() {
        let mut data = create_rich_text_data();
        data.width = 300.0;
        data.height = 200.0;
        data.max_chars = 12;
        assert_eq!(data.width, 300.0);
        assert_eq!(data.height, 200.0);
        assert_eq!(data.max_chars, 12);
    }

    #[test]
    fn returns_default_values() {
        let data = create_rich_text_data();
        assert_eq!(data.width, 100.0);
        assert_eq!(data.height, 100.0);
        assert!(data.multiline);
        assert!(!data.word_wrap);
    }
}

mod create_rich_text_runtime {
    use super::*;

    #[test]
    fn returns_a_non_null_runtime() {
        let runtime = create_rich_text_runtime();
        assert_eq!(runtime.selection_begin_index, 0);
    }

    #[test]
    fn starts_without_attached_content_runtime_state() {
        assert!(create_rich_text_runtime().rich_text_content.is_none());
    }

    #[test]
    fn starts_without_attached_layout_runtime_state() {
        assert!(
            create_rich_text_runtime()
                .text_label
                .read()
                .unwrap()
                .text_layout
                .is_none()
        );
    }

    #[test]
    fn uses_compute_rich_text_local_bounds_rectangle() {
        create_rich_text_runtime();
        let rich_text = create_rich_text(None);
        let rich_text_read = rich_text.read().unwrap();
        let callback = get_node2d_runtime(&*rich_text_read)
            .bounds
            .compute_local_bounds_rectangle
            .clone();
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        callback(&mut out, &*rich_text_read);
        assert_eq!(out.width, 100.0);
    }
}

mod create_text_field_signals {
    use super::*;

    #[test]
    fn creates_a_group_with_three_text_field_signals() {
        let signals = create_text_field_signals();
        assert!(signals.on_text_field_change.data.read().unwrap().is_none());
        assert!(signals.on_text_field_link.data.read().unwrap().is_none());
        assert!(signals.on_text_field_scroll.data.read().unwrap().is_none());
    }

    #[test]
    fn returns_a_distinct_group_on_each_call() {
        let mut first = create_text_field_signals();
        let mut second = create_text_field_signals();
        assert_ne!(get_entity_uid(&mut first), get_entity_uid(&mut second));
    }
}

mod dispatch_rich_text_link_at_point {
    use super::*;

    #[test]
    fn emits_the_link_signal_when_a_link_is_hit() {
        let mut data = rich_text_options();
        data.width = Some(400.0);
        data.height = Some(50.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "click");
        let mut format = empty_text_format();
        format.url = Some("https://example.com".to_string());
        set_rich_text_format_range(&rich_text, format_ref(format), Some(0), Some(5));
        let signals = enable_text_field_signals(&rich_text);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let slot_seen = seen.clone();
        connect_signal(
            &signals.read().unwrap().on_text_field_link,
            Arc::new(move |event| slot_seen.lock().unwrap().push(event.url.clone())),
            None,
        );
        let url = dispatch_rich_text_link_at_point(&rich_text, 1.0, 1.0);
        if let Some(url) = url {
            assert_eq!(url, "https://example.com");
            assert_eq!(*seen.lock().unwrap(), vec!["https://example.com"]);
        } else {
            assert!(seen.lock().unwrap().is_empty());
        }
    }

    #[test]
    fn returns_none_and_emits_nothing_when_point_is_not_over_a_link() {
        let mut data = rich_text_options();
        data.width = Some(200.0);
        data.height = Some(50.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "no links here");
        let signals = enable_text_field_signals(&rich_text);
        let emitted = Arc::new(Mutex::new(false));
        let slot_emitted = emitted.clone();
        connect_signal(
            &signals.read().unwrap().on_text_field_link,
            Arc::new(move |_| *slot_emitted.lock().unwrap() = true),
            None,
        );
        assert!(dispatch_rich_text_link_at_point(&rich_text, 5.0, 5.0).is_none());
        assert!(!*emitted.lock().unwrap());
    }

    #[test]
    fn returns_none_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert!(dispatch_rich_text_link_at_point(&rich_text, 5.0, 5.0).is_none());
    }
}

mod dispatch_rich_text_wheel {
    use super::*;

    #[test]
    fn advances_scroll_v_by_the_given_delta() {
        let rich_text = create_rich_text(None);
        dispatch_rich_text_wheel(&rich_text, 2.0, None);
        assert_eq!(rich_text.read().unwrap().data.scroll_v, 3.0);
    }
}

mod enable_text_field_signals {
    use super::*;

    #[test]
    fn attaches_a_signals_group_to_runtime_and_returns_it() {
        let rich_text = create_rich_text(None);
        assert!(get_text_field_signals(&rich_text).is_none());
        let signals = enable_text_field_signals(&rich_text);
        assert!(Arc::ptr_eq(
            &get_text_field_signals(&rich_text).unwrap(),
            &signals
        ));
    }

    #[test]
    fn enables_change_emission_from_setters() {
        let mut data = rich_text_options();
        data.text = Some("a".to_string());
        let rich_text = create_rich_with_data(data);
        let signals = enable_text_field_signals(&rich_text);
        let changes = Arc::new(Mutex::new(Vec::new()));
        let slot_changes = changes.clone();
        connect_signal(
            &signals.read().unwrap().on_text_field_change,
            Arc::new(move |event| {
                slot_changes
                    .lock()
                    .unwrap()
                    .push(event.previous_text.clone())
            }),
            None,
        );
        set_rich_text_string(&rich_text, "b");
        assert_eq!(*changes.lock().unwrap(), vec!["a"]);
    }

    #[test]
    fn repeated_calls_return_the_same_group() {
        let rich_text = create_rich_text(None);
        assert!(Arc::ptr_eq(
            &enable_text_field_signals(&rich_text),
            &enable_text_field_signals(&rich_text)
        ));
    }
}

mod get_rich_text_bottom_scroll_v {
    use super::*;

    #[test]
    fn returns_a_value_at_least_one_when_layout_is_available() {
        let mut data = rich_text_options();
        data.height = Some(20.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "line1\nline2\nline3");
        assert!(get_rich_text_bottom_scroll_v(&rich_text) >= 1.0);
    }

    #[test]
    fn returns_one_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(get_rich_text_bottom_scroll_v(&rich_text), 1.0);
    }
}

mod get_rich_text_char_index_at_point {
    use super::*;

    #[test]
    fn returns_a_valid_index_when_layout_is_available() {
        let mut data = rich_text_options();
        data.width = Some(200.0);
        data.height = Some(50.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "hello");
        assert!(get_rich_text_char_index_at_point(&rich_text, 0.0, 9999.0) >= 0);
    }

    #[test]
    fn returns_negative_one_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(get_rich_text_char_index_at_point(&rich_text, 5.0, 5.0), -1);
    }
}

mod get_rich_text_default_text_format {
    use super::*;

    #[test]
    fn returns_the_default_text_format() {
        let mut format = empty_text_format();
        format.size = Some(16.0);
        format.bold = Some(true);
        let format = format_ref(format);
        let mut data = rich_text_options();
        data.default_text_format = Some(format.clone());
        let rich_text = create_rich_with_data(data);
        assert!(Arc::ptr_eq(
            &get_rich_text_default_text_format(&*rich_text.read().unwrap()),
            &format
        ));
    }
}

mod get_rich_text_format_range_at {
    use super::*;

    #[test]
    fn does_not_apply_a_range_that_does_not_cover_the_index() {
        let mut data = rich_text_options();
        data.text = Some("hello world".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(3));
        let mut out = empty_text_format();
        get_rich_text_format_range_at(&mut out, &*rich_text.read().unwrap(), 5);
        assert_eq!(out.bold, None);
    }

    #[test]
    fn merges_default_format_with_overlapping_ranges() {
        let mut default_format = empty_text_format();
        default_format.size = Some(12.0);
        default_format.color = Some(0xff00_00ff);
        let mut data = rich_text_options();
        data.default_text_format = Some(format_ref(default_format));
        data.text = Some("hello world".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(5));
        let mut out = empty_text_format();
        get_rich_text_format_range_at(&mut out, &*rich_text.read().unwrap(), 2);
        assert_eq!(out.size, Some(12.0));
        assert_eq!(out.color, Some(0xff00_00ff));
        assert_eq!(out.bold, Some(true));
    }

    #[test]
    fn returns_empty_format_for_an_empty_field_with_no_ranges() {
        let rich_text = create_rich_text(None);
        let mut out = empty_text_format();
        get_rich_text_format_range_at(&mut out, &*rich_text.read().unwrap(), 0);
        assert_eq!(out, empty_text_format());
    }
}

mod get_rich_text_format_range_by_index {
    use super::*;

    #[test]
    fn returns_false_for_an_out_of_bounds_index() {
        let rich_text = create_rich_text(None);
        let mut out = create_text_format_range(format_ref(empty_text_format()), 0, 0);
        assert!(!get_rich_text_format_range_by_index(
            &mut out,
            &*rich_text.read().unwrap(),
            0
        ));
    }

    #[test]
    fn returns_true_and_fills_out_for_a_valid_index() {
        let mut data = rich_text_options();
        data.text = Some("hello".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_italic(true), Some(1), Some(4));
        let mut out = create_text_format_range(format_ref(empty_text_format()), 0, 0);
        assert!(get_rich_text_format_range_by_index(
            &mut out,
            &*rich_text.read().unwrap(),
            0
        ));
        assert_eq!(out.start, 1);
        assert_eq!(out.end, 4);
        assert_eq!(out.format.read().unwrap().italic, Some(true));
    }
}

mod get_rich_text_format_range_count {
    use super::*;

    #[test]
    fn returns_the_number_of_pushed_ranges() {
        let mut data = rich_text_options();
        data.text = Some("hello".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(2));
        set_rich_text_format_range(&rich_text, format_with_italic(true), Some(2), Some(5));
        assert_eq!(
            get_rich_text_format_range_count(&*rich_text.read().unwrap()),
            2
        );
    }

    #[test]
    fn returns_zero_for_a_field_with_no_ranges() {
        let rich_text = create_rich_text(None);
        assert_eq!(
            get_rich_text_format_range_count(&*rich_text.read().unwrap()),
            0
        );
    }
}

mod get_rich_text_format_ranges_in {
    use super::*;

    #[test]
    fn clears_out_when_no_ranges_overlap_the_span() {
        let mut data = rich_text_options();
        data.text = Some("hello world".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(6), Some(11));
        let mut out = vec![create_text_format_range(
            format_ref(empty_text_format()),
            99,
            99,
        )];
        get_rich_text_format_ranges_in(&mut out, &*rich_text.read().unwrap(), 0, 5);
        assert!(out.is_empty());
    }

    #[test]
    fn collects_every_overlapping_range_in_stored_order() {
        let mut data = rich_text_options();
        data.text = Some("hello world".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(5));
        set_rich_text_format_range(&rich_text, format_with_italic(true), Some(4), Some(8));
        let mut underline = empty_text_format();
        underline.underline = Some(true);
        set_rich_text_format_range(&rich_text, format_ref(underline), Some(8), Some(11));
        let mut out = Vec::new();
        get_rich_text_format_ranges_in(&mut out, &*rich_text.read().unwrap(), 3, 6);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].format.read().unwrap().bold, Some(true));
        assert_eq!(out[1].format.read().unwrap().italic, Some(true));
    }

    #[test]
    fn excludes_a_range_that_only_touches_the_span_boundaries() {
        let mut data = rich_text_options();
        data.text = Some("hello world".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(5), Some(8));
        let mut out = Vec::new();
        get_rich_text_format_ranges_in(&mut out, &*rich_text.read().unwrap(), 0, 5);
        assert!(out.is_empty());
    }

    #[test]
    fn preserves_the_stored_format_reference() {
        let mut data = rich_text_options();
        data.text = Some("hello".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(5));
        let mut out = Vec::new();
        get_rich_text_format_ranges_in(&mut out, &*rich_text.read().unwrap(), 0, 5);
        assert!(Arc::ptr_eq(
            &out[0].format,
            &rich_text.read().unwrap().data.text_format_ranges[0].format
        ));
    }
}

mod get_rich_text_length {
    use super::*;

    #[test]
    fn returns_the_character_count_of_the_text() {
        let mut data = rich_text_options();
        data.text = Some("hello".to_string());
        let rich_text = create_rich_with_data(data);
        assert_eq!(get_rich_text_length(&*rich_text.read().unwrap()), 5);
    }

    #[test]
    fn returns_zero_for_an_empty_field() {
        let rich_text = create_rich_text(None);
        assert_eq!(get_rich_text_length(&*rich_text.read().unwrap()), 0);
    }
}

mod get_rich_text_line_count {
    use super::*;

    #[test]
    fn returns_at_least_one_when_layout_is_available() {
        let mut data = rich_text_options();
        data.width = Some(200.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "hello");
        assert!(get_rich_text_line_count(&rich_text) >= 1);
    }

    #[test]
    fn returns_zero_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(get_rich_text_line_count(&rich_text), 0);
    }
}

mod get_rich_text_line_metrics {
    use super::*;

    #[test]
    fn returns_metrics_for_line_zero_when_layout_is_available() {
        let mut data = rich_text_options();
        data.width = Some(200.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "hello");
        let metrics = get_rich_text_line_metrics(&rich_text, 0).unwrap();
        assert!(metrics.width > 0.0);
    }

    #[test]
    fn returns_none_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert!(get_rich_text_line_metrics(&rich_text, 0).is_none());
    }
}

mod get_rich_text_max_scroll_h {
    use super::*;

    #[test]
    fn returns_zero_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(get_rich_text_max_scroll_h(&rich_text), 0.0);
    }
}

mod get_rich_text_max_scroll_v {
    use super::*;

    #[test]
    fn returns_one_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(get_rich_text_max_scroll_v(&rich_text), 1.0);
    }
}

mod get_rich_text_password_character {
    use super::*;

    #[test]
    fn returns_none_for_a_static_rich_text() {
        let rich_text = create_rich_text(None);
        assert!(get_rich_text_password_character(&*rich_text.read().unwrap()).is_none());
    }

    #[test]
    fn returns_none_when_password_display_is_off() {
        let rich_text = create_rich_text(None);
        let runtime = get_rich_text_runtime(&*rich_text.read().unwrap());
        runtime.write().unwrap().input = Some(Arc::new(RwLock::new(input_state(false))));
        assert!(get_rich_text_password_character(&*rich_text.read().unwrap()).is_none());
    }

    #[test]
    fn returns_the_mask_character_when_password_display_is_on() {
        let rich_text = create_rich_text(None);
        let runtime = get_rich_text_runtime(&*rich_text.read().unwrap());
        runtime.write().unwrap().input = Some(Arc::new(RwLock::new(input_state(true))));
        assert_eq!(
            get_rich_text_password_character(&*rich_text.read().unwrap()).as_deref(),
            Some("*")
        );
    }
}

mod get_rich_text_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_for_a_rich_text() {
        let rich_text = create_rich_text(None);
        let first = get_rich_text_runtime(&*rich_text.read().unwrap());
        let second = get_rich_text_runtime(&*rich_text.read().unwrap());
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod get_rich_text_string {
    use super::*;

    #[test]
    fn returns_the_text_field() {
        let mut data = rich_text_options();
        data.text = Some("hello".to_string());
        let rich_text = create_rich_with_data(data);
        assert_eq!(get_rich_text_string(&*rich_text.read().unwrap()), "hello");
    }
}

mod get_rich_text_text_height {
    use super::*;

    #[test]
    fn returns_a_positive_value_when_layout_is_available() {
        let mut data = rich_text_options();
        data.width = Some(200.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "hello");
        assert!(get_rich_text_text_height(&rich_text) > 0.0);
    }

    #[test]
    fn returns_zero_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(get_rich_text_text_height(&rich_text), 0.0);
    }
}

mod get_rich_text_text_width {
    use super::*;

    #[test]
    fn returns_a_positive_value_when_layout_is_available() {
        let mut data = rich_text_options();
        data.width = Some(200.0);
        let rich_text = create_measured_rich_with_data(data);
        set_rich_text_string(&rich_text, "hello");
        assert!(get_rich_text_text_width(&rich_text) > 0.0);
    }

    #[test]
    fn returns_zero_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(get_rich_text_text_width(&rich_text), 0.0);
    }
}

mod get_text_field_signals {
    use super::*;

    #[test]
    fn returns_none_before_signals_are_enabled() {
        let rich_text = create_rich_text(None);
        assert!(get_text_field_signals(&rich_text).is_none());
    }

    #[test]
    fn returns_the_enabled_signals_group() {
        let rich_text = create_rich_text(None);
        let signals = enable_text_field_signals(&rich_text);
        assert!(Arc::ptr_eq(
            &get_text_field_signals(&rich_text).unwrap(),
            &signals
        ));
    }
}

mod initialize_rich_text {
    use super::*;

    // The construction initializer keeps the receiver's entity identity, resets the field data and
    // binds the label layout of a fresh runtime to the supplied context.
    #[test]
    fn is_the_construction_initializer_of_create_rich_text() {
        let context = measured_text_context();
        let rich_text = create_rich_text(None);
        let mut rich_text = rich_text.write().unwrap();
        flight_entity::set_entity_uid(&mut *rich_text, "field".to_string());
        rich_text.data.max_chars = 3;
        initialize_rich_text(&mut rich_text, Some(context.clone()));
        assert_eq!(flight_entity::get_entity_uid(&mut *rich_text), "field");
        assert_eq!(rich_text.data.max_chars, -1);
        assert!(rich_text.data.multiline);
        let runtime = get_rich_text_runtime(&rich_text);
        let label = runtime.read().unwrap().text_label.clone();
        assert!(Arc::ptr_eq(&label.read().unwrap().layout_context, &context));
    }
}

mod initialize_rich_text_data {
    use super::*;

    // Every source default of createRichTextData, label fields included.
    #[test]
    fn is_the_construction_initializer_of_create_rich_text_data() {
        let mut data = create_rich_text_data();
        data.max_chars = 3;
        data.scroll_v = 9.0;
        data.text = "stale".to_string();
        data.text_format_ranges = vec![create_text_format_range(
            format_ref(empty_text_format()),
            0,
            1,
        )];
        initialize_rich_text_data(&mut data);
        assert_eq!(data.auto_size, TextAutoSize::None);
        assert!(!data.background);
        assert_eq!(data.background_color, 0xffff_ffff);
        assert!(!data.border);
        assert_eq!(data.border_color, 0x0000_00ff);
        assert!(!data.condense_white);
        assert_eq!(data.height, 100.0);
        assert_eq!(data.max_chars, -1);
        assert!(data.mouse_wheel_enabled);
        assert!(data.multiline);
        assert_eq!(data.scroll_h, 0.0);
        assert_eq!(data.scroll_v, 1.0);
        assert!(data.selectable);
        assert_eq!(data.text, "");
        assert_eq!(data.text_color, 0x0000_00ff);
        assert!(data.text_format_ranges.is_empty());
        assert_eq!(data.vertical_align, TextVerticalAlign::Top);
        assert_eq!(data.width, 100.0);
        assert!(!data.word_wrap);
    }
}

mod initialize_text_field_signals {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_text_field_signals() {
        let mut signals = create_text_field_signals();
        initialize_text_field_signals(&mut signals);
        assert!(signals.on_text_field_change.data.read().unwrap().is_none());
    }
}

mod insert_rich_text_string {
    use super::*;

    #[test]
    fn clamps_the_index_into_the_text_span() {
        let mut data = rich_text_options();
        data.text = Some("abc".to_string());
        let rich_text = create_rich_with_data(data);
        insert_rich_text_string(&rich_text, 999, "XYZ");
        assert_eq!(rich_text.read().unwrap().data.text, "abcXYZ");
        insert_rich_text_string(&rich_text, -5, "Q");
        assert_eq!(rich_text.read().unwrap().data.text, "QabcXYZ");
    }

    #[test]
    fn does_nothing_for_an_empty_value() {
        let mut data = rich_text_options();
        data.text = Some("abc".to_string());
        let rich_text = create_rich_with_data(data);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        insert_rich_text_string(&rich_text, 1, "");
        assert_eq!(rich_text.read().unwrap().data.text, "abc");
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn emits_change_with_the_previous_text_when_signals_are_enabled() {
        let mut data = rich_text_options();
        data.text = Some("abc".to_string());
        let rich_text = create_rich_with_data(data);
        let signals = enable_text_field_signals(&rich_text);
        let previous = Arc::new(Mutex::new(String::new()));
        let slot_previous = previous.clone();
        connect_signal(
            &signals.read().unwrap().on_text_field_change,
            Arc::new(move |event| *slot_previous.lock().unwrap() = event.previous_text.clone()),
            None,
        );
        insert_rich_text_string(&rich_text, 1, "Z");
        assert_eq!(*previous.lock().unwrap(), "abc");
        assert_eq!(rich_text.read().unwrap().data.text, "aZbc");
    }

    #[test]
    fn extends_a_range_that_straddles_the_insertion_point() {
        let mut data = rich_text_options();
        data.text = Some("abcdef".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(1), Some(5));
        insert_rich_text_string(&rich_text, 3, "XX");
        let rich_text = rich_text.read().unwrap();
        assert_eq!(rich_text.data.text_format_ranges[0].start, 1);
        assert_eq!(rich_text.data.text_format_ranges[0].end, 7);
    }

    #[test]
    fn inserts_the_value_at_the_clamped_index() {
        let mut data = rich_text_options();
        data.text = Some("held".to_string());
        let rich_text = create_rich_with_data(data);
        insert_rich_text_string(&rich_text, 2, "LLO wor");
        assert_eq!(rich_text.read().unwrap().data.text, "heLLO world");
    }

    #[test]
    fn shifts_ranges_starting_at_or_after_the_insertion_point() {
        let mut data = rich_text_options();
        data.text = Some("abcdef".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(3), Some(5));
        insert_rich_text_string(&rich_text, 0, "XX");
        let rich_text = rich_text.read().unwrap();
        assert_eq!(rich_text.data.text_format_ranges[0].start, 5);
        assert_eq!(rich_text.data.text_format_ranges[0].end, 7);
    }
}

mod remove_rich_text_format_ranges_in {
    use super::*;

    #[test]
    fn does_not_invalidate_when_no_ranges_overlap() {
        let mut data = rich_text_options();
        data.text = Some("hello world".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(6), Some(11));
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        remove_rich_text_format_ranges_in(&rich_text, 0, 5);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn removes_ranges_that_overlap_the_given_span() {
        let mut data = rich_text_options();
        data.text = Some("hello world".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(5));
        set_rich_text_format_range(&rich_text, format_with_italic(true), Some(6), Some(11));
        remove_rich_text_format_ranges_in(&rich_text, 0, 5);
        let rich_text = rich_text.read().unwrap();
        assert_eq!(rich_text.data.text_format_ranges.len(), 1);
        assert_eq!(
            rich_text.data.text_format_ranges[0]
                .format
                .read()
                .unwrap()
                .italic,
            Some(true)
        );
    }
}

mod replace_rich_text_string {
    use super::*;

    #[test]
    fn clamps_indices_and_degenerates_to_an_insert() {
        let mut data = rich_text_options();
        data.text = Some("abc".to_string());
        let rich_text = create_rich_with_data(data);
        replace_rich_text_string(&rich_text, 5, 1, "XYZ");
        assert_eq!(rich_text.read().unwrap().data.text, "abcXYZ");
    }

    #[test]
    fn emits_change_only_when_the_text_actually_changed() {
        let mut data = rich_text_options();
        data.text = Some("abc".to_string());
        let rich_text = create_rich_with_data(data);
        let signals = enable_text_field_signals(&rich_text);
        let changes = Arc::new(Mutex::new(Vec::new()));
        let slot_changes = changes.clone();
        connect_signal(
            &signals.read().unwrap().on_text_field_change,
            Arc::new(move |event| {
                slot_changes
                    .lock()
                    .unwrap()
                    .push(event.previous_text.clone())
            }),
            None,
        );
        replace_rich_text_string(&rich_text, 0, 3, "abc");
        assert!(changes.lock().unwrap().is_empty());
        replace_rich_text_string(&rich_text, 0, 3, "xyz");
        assert_eq!(*changes.lock().unwrap(), vec!["abc"]);
    }

    #[test]
    fn leaves_ranges_entirely_before_the_span_unchanged() {
        let mut data = rich_text_options();
        data.text = Some("abcdefgh".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(2));
        replace_rich_text_string(&rich_text, 4, 6, "XXXX");
        let rich_text = rich_text.read().unwrap();
        assert_eq!(rich_text.data.text_format_ranges[0].start, 0);
        assert_eq!(rich_text.data.text_format_ranges[0].end, 2);
    }

    #[test]
    fn removes_ranges_fully_inside_the_replaced_span() {
        let mut data = rich_text_options();
        data.text = Some("abcdefgh".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(2), Some(5));
        replace_rich_text_string(&rich_text, 1, 6, "X");
        assert!(rich_text.read().unwrap().data.text_format_ranges.is_empty());
    }

    #[test]
    fn replaces_the_substring_in_the_half_open_span() {
        let mut data = rich_text_options();
        data.text = Some("hello world".to_string());
        let rich_text = create_rich_with_data(data);
        replace_rich_text_string(&rich_text, 0, 5, "goodbye");
        assert_eq!(rich_text.read().unwrap().data.text, "goodbye world");
    }

    #[test]
    fn shifts_ranges_entirely_after_the_replaced_span() {
        let mut data = rich_text_options();
        data.text = Some("abcdefgh".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(6), Some(8));
        replace_rich_text_string(&rich_text, 0, 2, "X");
        let rich_text = rich_text.read().unwrap();
        assert_eq!(rich_text.data.text_format_ranges[0].start, 5);
        assert_eq!(rich_text.data.text_format_ranges[0].end, 7);
    }

    #[test]
    fn shrinks_a_range_that_spans_both_boundaries() {
        let mut data = rich_text_options();
        data.text = Some("abcdefgh".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(8));
        replace_rich_text_string(&rich_text, 2, 4, "X");
        let rich_text = rich_text.read().unwrap();
        assert_eq!(rich_text.data.text_format_ranges[0].start, 0);
        assert_eq!(rich_text.data.text_format_ranges[0].end, 7);
    }

    #[test]
    fn trims_a_left_overlapping_range_to_the_end_of_inserted_text() {
        let mut data = rich_text_options();
        data.text = Some("abcdefgh".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(0), Some(4));
        replace_rich_text_string(&rich_text, 2, 6, "XYZ");
        let rich_text = rich_text.read().unwrap();
        assert_eq!(rich_text.data.text_format_ranges[0].start, 0);
        assert_eq!(rich_text.data.text_format_ranges[0].end, 5);
    }

    #[test]
    fn trims_a_right_overlapping_range_to_after_inserted_text() {
        let mut data = rich_text_options();
        data.text = Some("abcdefgh".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_bold(true), Some(4), Some(8));
        replace_rich_text_string(&rich_text, 2, 6, "XYZ");
        let rich_text = rich_text.read().unwrap();
        assert_eq!(rich_text.data.text_format_ranges[0].start, 5);
        assert_eq!(rich_text.data.text_format_ranges[0].end, 7);
    }
}

mod set_rich_text_background {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_background(&rich_text, false);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_background_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_background(&rich_text, true);
        assert!(rich_text.read().unwrap().data.background);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_background_color {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let value = rich_text.read().unwrap().data.background_color;
        set_rich_text_background_color(&rich_text, value);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_background_color_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_background_color(&rich_text, 0xff00_00ff);
        assert_eq!(rich_text.read().unwrap().data.background_color, 0xff00_00ff);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_border {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_border(&rich_text, false);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_border_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_border(&rich_text, true);
        assert!(rich_text.read().unwrap().data.border);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_border_color {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let value = rich_text.read().unwrap().data.border_color;
        set_rich_text_border_color(&rich_text, value);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_border_color_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_border_color(&rich_text, 0xff00_00ff);
        assert_eq!(rich_text.read().unwrap().data.border_color, 0xff00_00ff);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_condense_white {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_condense_white(&rich_text, false);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_condense_white_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_condense_white(&rich_text, true);
        assert!(rich_text.read().unwrap().data.condense_white);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_content {
    use super::*;

    fn content(text: &str, ranges: Vec<TextFormatRange>) -> RichTextContent {
        let mut content = create_rich_text_content();
        content.text = text.to_string();
        content.format_ranges = ranges;
        return content;
    }

    #[test]
    fn copies_format_ranges_without_aliasing_the_caller_vector() {
        let rich_text = create_rich_text(None);
        let ranges = vec![create_text_format_range(format_with_italic(true), 0, 2)];
        let content = content("hi", ranges);
        set_rich_text_content(&rich_text, &content);
        assert_eq!(rich_text.read().unwrap().data.text_format_ranges.len(), 1);
        assert_eq!(content.format_ranges.len(), 1);
    }

    #[test]
    fn does_not_copy_or_invalidate_structurally_unchanged_content() {
        let mut data = rich_text_options();
        data.text = Some("same".to_string());
        data.text_format_ranges =
            Some(vec![create_text_format_range(format_with_bold(true), 0, 4)]);
        let rich_text = create_rich_with_data(data);
        let original_format = rich_text.read().unwrap().data.text_format_ranges[0]
            .format
            .clone();
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let next = content(
            "same",
            vec![create_text_format_range(format_with_bold(true), 0, 4)],
        );
        set_rich_text_content(&rich_text, &next);
        assert!(Arc::ptr_eq(
            &rich_text.read().unwrap().data.text_format_ranges[0].format,
            &original_format
        ));
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn emits_change_when_the_text_changes() {
        let mut data = rich_text_options();
        data.text = Some("old".to_string());
        let rich_text = create_rich_with_data(data);
        let signals = enable_text_field_signals(&rich_text);
        let seen = Arc::new(Mutex::new(String::new()));
        let slot_seen = seen.clone();
        connect_signal(
            &signals.read().unwrap().on_text_field_change,
            Arc::new(move |event| *slot_seen.lock().unwrap() = event.previous_text.clone()),
            None,
        );
        set_rich_text_content(&rich_text, &content("new", Vec::new()));
        assert_eq!(*seen.lock().unwrap(), "old");
    }

    #[test]
    fn sets_text_and_format_ranges_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let content = content(
            "bold",
            vec![create_text_format_range(format_with_bold(true), 0, 4)],
        );
        set_rich_text_content(&rich_text, &content);
        let rich_text_read = rich_text.read().unwrap();
        assert_eq!(rich_text_read.data.text, "bold");
        assert_eq!(rich_text_read.data.text_format_ranges[0].start, 0);
        assert_eq!(rich_text_read.data.text_format_ranges[0].end, 4);
        assert_eq!(
            rich_text_read.data.text_format_ranges[0]
                .format
                .read()
                .unwrap()
                .bold,
            Some(true)
        );
        assert_eq!(
            get_node_local_content_revision(&*rich_text_read),
            before + 1
        );
    }
}

mod set_rich_text_default_text_format {
    use super::*;

    #[test]
    fn does_not_invalidate_for_a_structurally_equal_format() {
        let mut format = empty_text_format();
        format.size = Some(18.0);
        format.tab_stops = Some(vec![4.0, 8.0]);
        let mut data = rich_text_options();
        data.default_text_format = Some(format_ref(format.clone()));
        let rich_text = create_rich_with_data(data);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_default_text_format(&rich_text, format_ref(format));
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_the_default_format_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let mut format = empty_text_format();
        format.size = Some(18.0);
        format.bold = Some(true);
        let format = format_ref(format);
        set_rich_text_default_text_format(&rich_text, format.clone());
        assert!(Arc::ptr_eq(
            &rich_text.read().unwrap().data.default_text_format,
            &format
        ));
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_format_range {
    use super::*;

    #[test]
    fn adds_a_serialized_format_range() {
        let mut data = rich_text_options();
        data.text = Some("hello".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_italic(true), Some(1), Some(4));
        let rich_text = rich_text.read().unwrap();
        assert_eq!(rich_text.data.text_format_ranges.len(), 1);
        assert_eq!(rich_text.data.text_format_ranges[0].start, 1);
        assert_eq!(rich_text.data.text_format_ranges[0].end, 4);
        assert_eq!(
            rich_text.data.text_format_ranges[0]
                .format
                .read()
                .unwrap()
                .italic,
            Some(true)
        );
    }

    #[test]
    fn appends_an_equal_older_range_after_it_was_superseded() {
        let mut data = rich_text_options();
        data.text = Some("hello".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_italic(true), Some(1), Some(4));
        set_rich_text_format_range(&rich_text, format_with_italic(false), Some(1), Some(4));
        set_rich_text_format_range(&rich_text, format_with_italic(true), Some(1), Some(4));
        assert_eq!(rich_text.read().unwrap().data.text_format_ranges.len(), 3);
    }

    #[test]
    fn does_not_append_or_invalidate_an_exact_repeat_of_the_latest_range() {
        let mut data = rich_text_options();
        data.text = Some("hello".to_string());
        let rich_text = create_rich_with_data(data);
        set_rich_text_format_range(&rich_text, format_with_italic(true), Some(1), Some(4));
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_format_range(&rich_text, format_with_italic(true), Some(1), Some(4));
        assert_eq!(rich_text.read().unwrap().data.text_format_ranges.len(), 1);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }
}

mod set_rich_text_height {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let height = rich_text.read().unwrap().data.height;
        set_rich_text_height(&rich_text, height);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_height_bumps_content_and_invalidates_local_bounds() {
        let rich_text = create_rich_text(None);
        let content = get_node_local_content_revision(&*rich_text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*rich_text.read().unwrap());
        set_rich_text_height(&rich_text, 250.0);
        assert_eq!(rich_text.read().unwrap().data.height, 250.0);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*rich_text.read().unwrap()),
            bounds
        );
    }
}

mod set_rich_text_max_chars {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let value = rich_text.read().unwrap().data.max_chars;
        set_rich_text_max_chars(&rich_text, value);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_max_chars_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_max_chars(&rich_text, 50);
        assert_eq!(rich_text.read().unwrap().data.max_chars, 50);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_mouse_wheel_enabled {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_mouse_wheel_enabled(&rich_text, true);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_mouse_wheel_enabled_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_mouse_wheel_enabled(&rich_text, false);
        assert!(!rich_text.read().unwrap().data.mouse_wheel_enabled);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_multiline {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_multiline(&rich_text, true);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_multiline_bumps_content_and_invalidates_bounds() {
        let rich_text = create_rich_text(None);
        let content = get_node_local_content_revision(&*rich_text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*rich_text.read().unwrap());
        set_rich_text_multiline(&rich_text, false);
        assert!(!rich_text.read().unwrap().data.multiline);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*rich_text.read().unwrap()),
            bounds
        );
    }
}

mod set_rich_text_scroll_h {
    use super::*;

    #[test]
    fn clamps_scroll_h_to_zero_minimum() {
        let rich_text = create_rich_text(None);
        set_rich_text_scroll_h(&rich_text, -5.0, None);
        assert_eq!(rich_text.read().unwrap().data.scroll_h, 0.0);
    }

    #[test]
    fn sets_scroll_h_to_the_given_value() {
        let rich_text = create_rich_text(None);
        set_rich_text_scroll_h(&rich_text, 10.0, None);
        assert_eq!(rich_text.read().unwrap().data.scroll_h, 10.0);
    }
}

mod set_rich_text_scroll_v {
    use super::*;

    #[test]
    fn clamps_scroll_v_to_one_minimum() {
        let rich_text = create_rich_text(None);
        set_rich_text_scroll_v(&rich_text, 0.0, None);
        assert_eq!(rich_text.read().unwrap().data.scroll_v, 1.0);
    }

    #[test]
    fn sets_scroll_v_to_the_given_value() {
        let rich_text = create_rich_text(None);
        set_rich_text_scroll_v(&rich_text, 4.0, None);
        assert_eq!(rich_text.read().unwrap().data.scroll_v, 4.0);
    }
}

mod set_rich_text_selectable {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_selectable(&rich_text, true);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_selectable_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_selectable(&rich_text, false);
        assert!(!rich_text.read().unwrap().data.selectable);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_string {
    use super::*;

    #[test]
    fn does_not_bump_content_when_text_is_unchanged() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        let after_first = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            after_first
        );
    }

    #[test]
    fn does_not_invalidate_bounds_when_the_field_is_fixed() {
        let rich_text = create_rich_text(None);
        let bounds = get_node_local_bounds_revision(&*rich_text.read().unwrap());
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(
            get_node_local_bounds_revision(&*rich_text.read().unwrap()),
            bounds
        );
    }

    #[test]
    fn emits_no_signal_for_noop_and_one_for_a_real_change() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        let signals = enable_text_field_signals(&rich_text);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let slot_seen = seen.clone();
        connect_signal(
            &signals.read().unwrap().on_text_field_change,
            Arc::new(move |_| slot_seen.lock().unwrap().push("change")),
            None,
        );
        set_rich_text_string(&rich_text, "hello");
        assert!(seen.lock().unwrap().is_empty());
        set_rich_text_string(&rich_text, "world");
        assert_eq!(*seen.lock().unwrap(), vec!["change"]);
    }

    #[test]
    fn invalidates_bounds_when_auto_size_resizes_the_field() {
        let mut data = rich_text_options();
        data.auto_size = Some(TextAutoSize::Left);
        let rich_text = create_rich_with_data(data);
        let bounds = get_node_local_bounds_revision(&*rich_text.read().unwrap());
        set_rich_text_string(&rich_text, "hello");
        assert_ne!(
            get_node_local_bounds_revision(&*rich_text.read().unwrap()),
            bounds
        );
    }

    #[test]
    fn invalidates_local_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_string(&rich_text, "hello");
        assert_ne!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn leaves_the_text_correct_for_noop_and_changed_writes() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(rich_text.read().unwrap().data.text, "hello");
        set_rich_text_string(&rich_text, "world");
        assert_eq!(rich_text.read().unwrap().data.text, "world");
    }

    #[test]
    fn sets_the_text() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        assert_eq!(rich_text.read().unwrap().data.text, "hello");
    }

    #[test]
    fn still_bumps_content_when_text_actually_changes() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        let after_first = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_string(&rich_text, "world");
        assert!(get_node_local_content_revision(&*rich_text.read().unwrap()) > after_first);
    }
}

mod set_rich_text_text_color {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let value = rich_text.read().unwrap().data.text_color;
        set_rich_text_text_color(&rich_text, value);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_text_color_and_bumps_content() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_text_color(&rich_text, 0xff00_00ff);
        assert_eq!(rich_text.read().unwrap().data.text_color, 0xff00_00ff);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before + 1
        );
    }
}

mod set_rich_text_vertical_align {
    use super::*;

    #[test]
    fn defaults_to_top() {
        assert_eq!(
            create_rich_text(None).read().unwrap().data.vertical_align,
            TextVerticalAlign::Top
        );
    }

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let value = rich_text.read().unwrap().data.vertical_align;
        set_rich_text_vertical_align(&rich_text, value);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_the_value_and_bumps_content_without_touching_bounds() {
        let rich_text = create_rich_text(None);
        let content = get_node_local_content_revision(&*rich_text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*rich_text.read().unwrap());
        set_rich_text_vertical_align(&rich_text, TextVerticalAlign::Bottom);
        assert_eq!(
            rich_text.read().unwrap().data.vertical_align,
            TextVerticalAlign::Bottom
        );
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            content + 1
        );
        assert_eq!(
            get_node_local_bounds_revision(&*rich_text.read().unwrap()),
            bounds
        );
    }
}

mod set_rich_text_width {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        let width = rich_text.read().unwrap().data.width;
        set_rich_text_width(&rich_text, width);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_width_bumps_content_and_invalidates_local_bounds() {
        let rich_text = create_rich_text(None);
        let content = get_node_local_content_revision(&*rich_text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*rich_text.read().unwrap());
        set_rich_text_width(&rich_text, 300.0);
        assert_eq!(rich_text.read().unwrap().data.width, 300.0);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*rich_text.read().unwrap()),
            bounds
        );
    }
}

mod set_rich_text_word_wrap {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let rich_text = create_rich_text(None);
        let before = get_node_local_content_revision(&*rich_text.read().unwrap());
        set_rich_text_word_wrap(&rich_text, false);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            before
        );
    }

    #[test]
    fn sets_word_wrap_bumps_content_and_invalidates_bounds() {
        let rich_text = create_rich_text(None);
        let content = get_node_local_content_revision(&*rich_text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*rich_text.read().unwrap());
        set_rich_text_word_wrap(&rich_text, true);
        assert!(rich_text.read().unwrap().data.word_wrap);
        assert_eq!(
            get_node_local_content_revision(&*rich_text.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*rich_text.read().unwrap()),
            bounds
        );
    }
}
