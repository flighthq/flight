//! flight-compiler: rust-only

use std::sync::{Arc, RwLock};

use flight_geometry::create_rectangle;
use flight_node::NodeRef;
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textlayout::{
    TextAutoSize, TextVerticalAlign, create_rich_text_content, create_text_format_range,
    create_text_layout_result, create_text_metrics,
};
use flight_textshaper::TextMeasureFunction;

use super::*;

mod native_text_sugar {
    use super::*;

    #[test]
    fn native_text_compute_local_bounds_rectangle_matches_free_function() {
        let source = native_text();
        let mut method = create_rectangle(1.0, 2.0, 3.0, 4.0);
        let mut function = create_rectangle(1.0, 2.0, 3.0, 4.0);
        source.compute_local_bounds_rectangle(&mut method);
        compute_native_text_local_bounds_rectangle(&mut function, &*source.read().unwrap());
        assert_eq!(method, function);
    }

    #[test]
    fn native_text_measured_height_matches_free_function() {
        let source = native_text();
        assert_eq!(
            source.measured_height(),
            get_native_text_measured_height(&source.read().unwrap())
        );
    }

    #[test]
    fn native_text_measured_width_matches_free_function() {
        let source = native_text();
        assert_eq!(
            source.measured_width(),
            get_native_text_measured_width(&source.read().unwrap())
        );
    }

    #[test]
    fn native_text_new_matches_create_native_text() {
        let method = NativeText::new();
        let function = create_native_text();
        assert_eq!(
            method.read().unwrap().data.text,
            function.read().unwrap().data.text
        );
    }

    #[test]
    fn native_text_patch_style_matches_free_function() {
        let method = native_text();
        let function = native_text();
        let patch = NativeTextStyle {
            bold: Some(true),
            color: Some(0x1234_56ff),
            ..NativeTextStyle::default()
        };
        method.patch_style(&patch);
        patch_native_text_style(&function, &patch);
        assert_eq!(
            *method.style().read().unwrap(),
            *get_native_text_style(&function.read().unwrap())
                .read()
                .unwrap()
        );
    }

    macro_rules! native_text_setter_test {
        ($test:ident, $method:ident, $function:ident, $field:ident, $value:expr) => {
            #[test]
            fn $test() {
                let method = native_text();
                let function = native_text();
                method.$method($value);
                $function(&function, $value);
                assert_eq!(
                    method.read().unwrap().data.$field,
                    function.read().unwrap().data.$field
                );
            }
        };
    }

    native_text_setter_test!(
        native_text_set_auto_size_matches_free_function,
        set_auto_size,
        set_native_text_auto_size,
        auto_size,
        TextAutoSize::Center
    );
    native_text_setter_test!(
        native_text_set_height_matches_free_function,
        set_height,
        set_native_text_height,
        height,
        42.0
    );
    native_text_setter_test!(
        native_text_set_vertical_align_matches_free_function,
        set_vertical_align,
        set_native_text_vertical_align,
        vertical_align,
        TextVerticalAlign::Bottom
    );
    native_text_setter_test!(
        native_text_set_width_matches_free_function,
        set_width,
        set_native_text_width,
        width,
        73.0
    );

    #[test]
    fn native_text_set_string_matches_free_function() {
        let method = native_text();
        let function = native_text();
        method.set_string("method");
        set_native_text_string(&function, "method");
        assert_eq!(
            method.read().unwrap().data.text,
            function.read().unwrap().data.text
        );
    }

    #[test]
    fn native_text_set_style_matches_free_function() {
        let method = native_text();
        let function = native_text();
        let style = Arc::new(RwLock::new(NativeTextStyle {
            size: Some(18.0),
            ..NativeTextStyle::default()
        }));
        method.set_style(style.clone());
        set_native_text_style(&function, style.clone());
        assert!(Arc::ptr_eq(&method.style(), &style));
        assert!(Arc::ptr_eq(
            &get_native_text_style(&function.read().unwrap()),
            &style
        ));
    }

    #[test]
    fn native_text_string_matches_free_function() {
        let source = native_text();
        assert_eq!(
            source.string(),
            get_native_text_string(&source.read().unwrap())
        );
    }

    #[test]
    fn native_text_style_matches_free_function() {
        let source = native_text();
        assert!(Arc::ptr_eq(
            &source.style(),
            &get_native_text_style(&source.read().unwrap())
        ));
    }
}

mod text_label_sugar {
    use super::*;

    #[test]
    fn text_label_append_string_matches_free_function() {
        let method = text_label();
        let function = text_label();
        method.append_string("tail");
        append_text_label_string(&function, "tail");
        assert_eq!(
            method.read().unwrap().data.text,
            function.read().unwrap().data.text
        );
    }

    #[test]
    fn text_label_compute_local_bounds_rectangle_matches_free_function() {
        let source = text_label();
        let mut method = create_rectangle(1.0, 2.0, 3.0, 4.0);
        let mut function = create_rectangle(1.0, 2.0, 3.0, 4.0);
        source.compute_local_bounds_rectangle(&mut method);
        compute_text_label_local_bounds_rectangle(&mut function, &*source.read().unwrap());
        assert_eq!(method, function);
    }

    #[test]
    fn text_label_format_matches_free_function() {
        let source = text_label();
        assert!(Arc::ptr_eq(
            &source.format(),
            &get_text_label_format(&source.read().unwrap())
        ));
    }

    #[test]
    fn text_label_new_matches_create_text_label() {
        let method = TextLabel::new(None);
        let function = create_text_label(None);
        assert_eq!(
            method.read().unwrap().data.text,
            function.read().unwrap().data.text
        );
    }

    macro_rules! text_label_setter_test {
        ($test:ident, $method:ident, $function:ident, $field:ident, $value:expr) => {
            #[test]
            fn $test() {
                let method = text_label();
                let function = text_label();
                method.$method($value);
                $function(&function, $value);
                assert_eq!(
                    method.read().unwrap().data.$field,
                    function.read().unwrap().data.$field
                );
            }
        };
    }

    text_label_setter_test!(
        text_label_set_auto_size_matches_free_function,
        set_auto_size,
        set_text_label_auto_size,
        auto_size,
        TextAutoSize::Right
    );
    text_label_setter_test!(
        text_label_set_height_matches_free_function,
        set_height,
        set_text_label_height,
        height,
        24.0
    );
    text_label_setter_test!(
        text_label_set_vertical_align_matches_free_function,
        set_vertical_align,
        set_text_label_vertical_align,
        vertical_align,
        TextVerticalAlign::Middle
    );
    text_label_setter_test!(
        text_label_set_width_matches_free_function,
        set_width,
        set_text_label_width,
        width,
        64.0
    );

    #[test]
    fn text_label_set_format_matches_free_function() {
        let method = text_label();
        let function = text_label();
        let format = format_ref(Some(0xabcdef01));
        method.set_format(format.clone());
        set_text_label_format(&function, format.clone());
        assert!(Arc::ptr_eq(&method.format(), &format));
        assert!(Arc::ptr_eq(
            &get_text_label_format(&function.read().unwrap()),
            &format
        ));
    }

    #[test]
    fn text_label_set_string_matches_free_function() {
        let method = text_label();
        let function = text_label();
        method.set_string("method");
        set_text_label_string(&function, "method");
        assert_eq!(
            method.read().unwrap().data.text,
            function.read().unwrap().data.text
        );
    }

    #[test]
    fn text_label_string_matches_free_function() {
        let source = text_label();
        assert_eq!(
            source.string(),
            get_text_label_string(&source.read().unwrap())
        );
    }
}

mod rich_text_sugar {
    use super::*;

    #[test]
    fn rich_text_append_string_matches_free_function() {
        let method = rich_text();
        let function = rich_text();
        method.append_string("tail");
        append_rich_text_string(&function, "tail");
        assert_eq!(
            method.read().unwrap().data.text,
            function.read().unwrap().data.text
        );
    }

    #[test]
    fn rich_text_bottom_scroll_v_matches_free_function() {
        let source = rich_text();
        assert_eq!(
            source.bottom_scroll_v(),
            get_rich_text_bottom_scroll_v(&source)
        );
    }

    #[test]
    fn rich_text_build_layout_params_matches_free_function() {
        let source = rich_text();
        source.set_string("abcd");
        let method = source.build_layout_params(measure());
        let function = build_rich_text_layout_params(&source.read().unwrap(), measure());
        assert_eq!(method.text, function.text);
        assert_eq!(method.height, function.height);
        assert_eq!(method.width, function.width);
        assert_ranges_equal(&method.format_ranges, &function.format_ranges);
    }

    #[test]
    fn rich_text_char_index_at_point_matches_free_function() {
        let source = rich_text();
        assert_eq!(
            source.char_index_at_point(2.0, 3.0),
            get_rich_text_char_index_at_point(&source, 2.0, 3.0)
        );
    }

    #[test]
    fn rich_text_clear_format_ranges_matches_free_function() {
        let method = rich_text_with_range();
        let function = rich_text_with_range();
        method.clear_format_ranges();
        clear_rich_text_format_ranges(&function);
        assert_eq!(
            method.format_range_count(),
            function.read().unwrap().data.text_format_ranges.len()
        );
    }

    #[test]
    fn rich_text_compute_local_bounds_rectangle_matches_free_function() {
        let source = rich_text();
        let mut method = create_rectangle(1.0, 2.0, 3.0, 4.0);
        let mut function = create_rectangle(1.0, 2.0, 3.0, 4.0);
        source.compute_local_bounds_rectangle(&mut method);
        compute_rich_text_local_bounds_rectangle(&mut function, &*source.read().unwrap());
        assert_eq!(method, function);
    }

    #[test]
    fn rich_text_default_text_format_matches_free_function() {
        let source = rich_text();
        assert!(Arc::ptr_eq(
            &source.default_text_format(),
            &get_rich_text_default_text_format(&source.read().unwrap())
        ));
    }

    #[test]
    fn rich_text_dispatch_link_at_point_matches_free_function() {
        let source = rich_text();
        assert_eq!(
            source.dispatch_link_at_point(2.0, 3.0),
            dispatch_rich_text_link_at_point(&source, 2.0, 3.0)
        );
    }

    #[test]
    fn rich_text_dispatch_wheel_matches_free_function() {
        let method = rich_text();
        let function = rich_text();
        method.dispatch_wheel(2.0, None);
        dispatch_rich_text_wheel(&function, 2.0, None);
        assert_eq!(
            method.read().unwrap().data.scroll_v,
            function.read().unwrap().data.scroll_v
        );
    }

    #[test]
    fn rich_text_enable_signals_matches_free_function() {
        let source = rich_text();
        let method = source.enable_signals();
        let function = enable_text_field_signals(&source);
        assert!(Arc::ptr_eq(&method, &function));
    }

    #[test]
    fn rich_text_format_range_at_matches_free_function() {
        let source = rich_text_with_range();
        let mut method = format();
        let mut function = format();
        source.format_range_at(&mut method, 2);
        get_rich_text_format_range_at(&mut function, &source.read().unwrap(), 2);
        assert_eq!(method, function);
    }

    #[test]
    fn rich_text_format_range_by_index_matches_free_function() {
        let source = rich_text_with_range();
        let mut method = create_text_format_range(format_ref(None), 0, 0);
        let mut function = create_text_format_range(format_ref(None), 0, 0);
        assert_eq!(
            source.format_range_by_index(&mut method, 0),
            get_rich_text_format_range_by_index(&mut function, &source.read().unwrap(), 0)
        );
        assert_ranges_equal(&[method], &[function]);
    }

    #[test]
    fn rich_text_format_range_count_matches_free_function() {
        let source = rich_text_with_range();
        assert_eq!(
            source.format_range_count(),
            get_rich_text_format_range_count(&source.read().unwrap())
        );
    }

    #[test]
    fn rich_text_format_ranges_in_matches_free_function() {
        let source = rich_text_with_range();
        let mut method = Vec::new();
        let mut function = Vec::new();
        source.format_ranges_in(&mut method, 0, 4);
        get_rich_text_format_ranges_in(&mut function, &source.read().unwrap(), 0, 4);
        assert_ranges_equal(&method, &function);
    }

    #[test]
    fn rich_text_insert_string_matches_free_function() {
        let method = rich_text_with_range();
        let function = rich_text_with_range();
        method.insert_string(2, "XY");
        insert_rich_text_string(&function, 2, "XY");
        assert_eq!(method.string(), function.read().unwrap().data.text);
        assert_ranges_equal(
            &method.read().unwrap().data.text_format_ranges,
            &function.read().unwrap().data.text_format_ranges,
        );
    }

    #[test]
    fn rich_text_length_matches_free_function() {
        let source = rich_text();
        source.set_string("a😀");
        assert_eq!(
            source.length(),
            get_rich_text_length(&source.read().unwrap())
        );
    }

    #[test]
    fn rich_text_line_count_matches_free_function() {
        let source = rich_text();
        assert_eq!(source.line_count(), get_rich_text_line_count(&source));
    }

    #[test]
    fn rich_text_line_metrics_matches_free_function() {
        let source = rich_text();
        assert_eq!(
            source.line_metrics(0),
            get_rich_text_line_metrics(&source, 0)
        );
    }

    #[test]
    fn rich_text_max_scroll_h_matches_free_function() {
        let source = rich_text();
        assert_eq!(source.max_scroll_h(), get_rich_text_max_scroll_h(&source));
    }

    #[test]
    fn rich_text_max_scroll_v_matches_free_function() {
        let source = rich_text();
        assert_eq!(source.max_scroll_v(), get_rich_text_max_scroll_v(&source));
    }

    #[test]
    fn rich_text_new_matches_create_rich_text() {
        let method = RichText::new(None);
        let function = create_rich_text(None);
        assert_eq!(
            method.read().unwrap().data.text,
            function.read().unwrap().data.text
        );
    }

    #[test]
    fn rich_text_password_character_matches_free_function() {
        let source = rich_text();
        assert_eq!(
            source.password_character(),
            get_rich_text_password_character(&source.read().unwrap())
        );
    }

    #[test]
    fn rich_text_remove_format_ranges_in_matches_free_function() {
        let method = rich_text_with_range();
        let function = rich_text_with_range();
        method.remove_format_ranges_in(0, 2);
        remove_rich_text_format_ranges_in(&function, 0, 2);
        assert_ranges_equal(
            &method.read().unwrap().data.text_format_ranges,
            &function.read().unwrap().data.text_format_ranges,
        );
    }

    #[test]
    fn rich_text_replace_string_matches_free_function() {
        let method = rich_text_with_range();
        let function = rich_text_with_range();
        method.replace_string(1, 3, "XY");
        replace_rich_text_string(&function, 1, 3, "XY");
        assert_eq!(method.string(), function.read().unwrap().data.text);
        assert_ranges_equal(
            &method.read().unwrap().data.text_format_ranges,
            &function.read().unwrap().data.text_format_ranges,
        );
    }

    macro_rules! rich_text_setter_test {
        ($test:ident, $method:ident, $function:ident, $field:ident, $value:expr) => {
            #[test]
            fn $test() {
                let method = rich_text();
                let function = rich_text();
                method.$method($value);
                $function(&function, $value);
                assert_eq!(
                    method.read().unwrap().data.$field,
                    function.read().unwrap().data.$field
                );
            }
        };
    }

    rich_text_setter_test!(
        rich_text_set_background_matches_free_function,
        set_background,
        set_rich_text_background,
        background,
        true
    );
    rich_text_setter_test!(
        rich_text_set_background_color_matches_free_function,
        set_background_color,
        set_rich_text_background_color,
        background_color,
        0x1234_56ff
    );
    rich_text_setter_test!(
        rich_text_set_border_matches_free_function,
        set_border,
        set_rich_text_border,
        border,
        true
    );
    rich_text_setter_test!(
        rich_text_set_border_color_matches_free_function,
        set_border_color,
        set_rich_text_border_color,
        border_color,
        0xabcdef01
    );
    rich_text_setter_test!(
        rich_text_set_condense_white_matches_free_function,
        set_condense_white,
        set_rich_text_condense_white,
        condense_white,
        true
    );
    rich_text_setter_test!(
        rich_text_set_height_matches_free_function,
        set_height,
        set_rich_text_height,
        height,
        48.0
    );
    rich_text_setter_test!(
        rich_text_set_max_chars_matches_free_function,
        set_max_chars,
        set_rich_text_max_chars,
        max_chars,
        12
    );
    rich_text_setter_test!(
        rich_text_set_mouse_wheel_enabled_matches_free_function,
        set_mouse_wheel_enabled,
        set_rich_text_mouse_wheel_enabled,
        mouse_wheel_enabled,
        false
    );
    rich_text_setter_test!(
        rich_text_set_multiline_matches_free_function,
        set_multiline,
        set_rich_text_multiline,
        multiline,
        false
    );
    rich_text_setter_test!(
        rich_text_set_selectable_matches_free_function,
        set_selectable,
        set_rich_text_selectable,
        selectable,
        false
    );
    rich_text_setter_test!(
        rich_text_set_text_color_matches_free_function,
        set_text_color,
        set_rich_text_text_color,
        text_color,
        0x1234_56ff
    );
    rich_text_setter_test!(
        rich_text_set_vertical_align_matches_free_function,
        set_vertical_align,
        set_rich_text_vertical_align,
        vertical_align,
        TextVerticalAlign::Bottom
    );
    rich_text_setter_test!(
        rich_text_set_width_matches_free_function,
        set_width,
        set_rich_text_width,
        width,
        91.0
    );
    rich_text_setter_test!(
        rich_text_set_word_wrap_matches_free_function,
        set_word_wrap,
        set_rich_text_word_wrap,
        word_wrap,
        true
    );

    #[test]
    fn rich_text_set_content_matches_free_function() {
        let method = rich_text();
        let function = rich_text();
        let mut content = create_rich_text_content();
        content.text = "content".to_string();
        content
            .format_ranges
            .push(create_text_format_range(format_ref(Some(7)), 0, 7));
        method.set_content(&content);
        set_rich_text_content(&function, &content);
        assert_eq!(method.string(), function.read().unwrap().data.text);
        assert_ranges_equal(
            &method.read().unwrap().data.text_format_ranges,
            &function.read().unwrap().data.text_format_ranges,
        );
    }

    #[test]
    fn rich_text_set_default_text_format_matches_free_function() {
        let method = rich_text();
        let function = rich_text();
        let format = format_ref(Some(5));
        method.set_default_text_format(format.clone());
        set_rich_text_default_text_format(&function, format.clone());
        assert!(Arc::ptr_eq(&method.default_text_format(), &format));
        assert!(Arc::ptr_eq(
            &get_rich_text_default_text_format(&function.read().unwrap()),
            &format
        ));
    }

    #[test]
    fn rich_text_set_format_range_matches_free_function() {
        let method = rich_text();
        let function = rich_text();
        method.set_string("abcd");
        set_rich_text_string(&function, "abcd");
        let format = format_ref(Some(5));
        method.set_format_range(format.clone(), Some(1), Some(3));
        set_rich_text_format_range(&function, format, Some(1), Some(3));
        assert_ranges_equal(
            &method.read().unwrap().data.text_format_ranges,
            &function.read().unwrap().data.text_format_ranges,
        );
    }

    #[test]
    fn rich_text_set_scroll_h_matches_free_function() {
        let method = rich_text();
        let function = rich_text();
        let layout = create_text_layout_result();
        method.set_scroll_h(4.6, Some(&layout));
        set_rich_text_scroll_h(&function, 4.6, Some(&layout));
        assert_eq!(
            method.read().unwrap().data.scroll_h,
            function.read().unwrap().data.scroll_h
        );
    }

    #[test]
    fn rich_text_set_scroll_v_matches_free_function() {
        let method = rich_text();
        let function = rich_text();
        let layout = create_text_layout_result();
        method.set_scroll_v(4.6, Some(&layout));
        set_rich_text_scroll_v(&function, 4.6, Some(&layout));
        assert_eq!(
            method.read().unwrap().data.scroll_v,
            function.read().unwrap().data.scroll_v
        );
    }

    #[test]
    fn rich_text_set_string_matches_free_function() {
        let method = rich_text();
        let function = rich_text();
        method.set_string("method");
        set_rich_text_string(&function, "method");
        assert_eq!(
            method.read().unwrap().data.text,
            function.read().unwrap().data.text
        );
    }

    #[test]
    fn rich_text_signals_matches_free_function() {
        let source = rich_text();
        assert!(source.signals().is_none());
        assert!(get_text_field_signals(&source).is_none());
    }

    #[test]
    fn rich_text_string_matches_free_function() {
        let source = rich_text();
        assert_eq!(
            source.string(),
            get_rich_text_string(&source.read().unwrap())
        );
    }

    #[test]
    fn rich_text_text_height_matches_free_function() {
        let source = rich_text();
        assert_eq!(source.text_height(), get_rich_text_text_height(&source));
    }

    #[test]
    fn rich_text_text_width_matches_free_function() {
        let source = rich_text();
        assert_eq!(source.text_width(), get_rich_text_text_width(&source));
    }
}

mod text_node_sugar {
    use super::*;

    #[test]
    fn text_node_explain_text_content_matches_free_function() {
        let source: NodeRef = text_label();
        assert_eq!(
            source.explain_text_content(),
            explain_text_label_content(&*source.read().unwrap())
        );
    }

    #[test]
    fn text_node_layout_matches_free_function() {
        let source: NodeRef = text_label();
        assert!(source.layout().is_none());
        assert!(get_text_layout(&source).is_none());
    }

    #[test]
    fn text_node_layout_metrics_matches_free_function() {
        let source: NodeRef = text_label();
        let mut method = create_text_metrics();
        let mut function = create_text_metrics();
        source.layout_metrics(&mut method);
        get_text_layout_metrics(&mut function, &source);
        assert_eq!(method, function);
    }
}

mod text_format_sugar {
    use super::*;

    #[test]
    fn text_format_font_string_matches_free_function() {
        let mut format = format();
        format.bold = Some(true);
        format.font = Some("Inter".to_string());
        assert_eq!(
            format.font_string(),
            compute_text_format_font_string(&format)
        );
    }
}

fn assert_ranges_equal(left: &[TextFormatRange], right: &[TextFormatRange]) {
    assert_eq!(left.len(), right.len());
    for (left, right) in left.iter().zip(right) {
        assert_eq!(left.start, right.start);
        assert_eq!(left.end, right.end);
        assert_eq!(*left.format.read().unwrap(), *right.format.read().unwrap());
    }
}

fn format() -> TextFormat {
    let make: fn() -> TextFormat = TextFormat::default;
    return make();
}

fn format_ref(color: Option<u32>) -> Ref<TextFormat> {
    let mut format = format();
    format.color = color;
    return Arc::new(RwLock::new(format));
}

fn measure() -> TextMeasureFunction {
    return Arc::new(|text, _| text.encode_utf16().count() as f32 * 4.0);
}

fn native_text() -> Ref<NativeText> {
    return create_native_text();
}

fn rich_text() -> Ref<RichText> {
    return create_rich_text(None);
}

fn rich_text_with_range() -> Ref<RichText> {
    let source = rich_text();
    set_rich_text_string(&source, "abcd");
    set_rich_text_format_range(&source, format_ref(Some(0x1234_56ff)), Some(1), Some(3));
    return source;
}

fn text_label() -> Ref<TextLabel> {
    return create_text_label(None);
}
