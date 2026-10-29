//! flight-compiler: rust-only

use std::sync::{Arc, RwLock};

use flight_geometry::create_rectangle;
use flight_textformat::create_text_format_range;

use super::*;
use crate::contract::*;

fn format() -> TextFormat {
    return TextFormat {
        align: None,
        block_indent: None,
        bold: None,
        bullet: None,
        color: None,
        font: None,
        indent: None,
        italic: None,
        kerning: None,
        leading: None,
        left_margin: None,
        letter_spacing: None,
        list_marker: None,
        right_margin: None,
        size: Some(16.0),
        strikethrough: None,
        tab_stops: None,
        target: None,
        underline: None,
        url: None,
        variations: None,
    };
}

fn params() -> TextLayoutParams {
    let format = Arc::new(RwLock::new(format()));
    return TextLayoutParams {
        auto_size: None,
        border: None,
        direction: None,
        format_ranges: vec![create_text_format_range(format, 0, 2)],
        height: 100.0,
        justification: None,
        max_lines: None,
        measure: Arc::new(|text, _| text.encode_utf16().count() as f32 * 10.0),
        multiline: None,
        text: "hi".to_string(),
        truncation_character: None,
        vertical_align: None,
        width: 100.0,
        word_wrap: None,
    };
}

#[test]
fn rich_text_content_new_matches_free_function() {
    let method = RichTextContent::new();
    let function = create_rich_text_content();
    assert_eq!(method.text, function.text);
    assert_eq!(method.format_ranges.len(), function.format_ranges.len());
}

#[test]
fn text_auto_size_as_str_matches_free_function() {
    assert_eq!(
        TextAutoSize::Center.as_str(),
        get_text_auto_size_string(TextAutoSize::Center)
    );
}

#[test]
fn text_bounds_spec_methods_match_free_functions() {
    let spec = TextBoundsSpec {
        auto_size: TextAutoSize::Center,
        height: 100.0,
        width: 80.0,
        word_wrap: Some(false),
    };
    let mut layout = create_text_layout_result();
    layout.text_height = 12.5;
    layout.text_width = 30.25;
    assert_eq!(
        spec.compute_height(&layout),
        compute_text_bounds_height(&spec, &layout)
    );
    assert_eq!(
        spec.compute_offset_x(&layout),
        compute_text_bounds_offset_x(&spec, &layout)
    );
    assert_eq!(
        spec.compute_width(&layout),
        compute_text_bounds_width(&spec, &layout)
    );
    let mut method = create_rectangle(0.0, 0.0, 0.0, 0.0);
    let mut function = create_rectangle(0.0, 0.0, 0.0, 0.0);
    spec.compute_rectangle(&mut method, &layout);
    compute_text_bounds_rectangle(&mut function, &spec, &layout);
    assert_eq!(method, function);
}

#[test]
fn text_justification_as_str_matches_free_function() {
    assert_eq!(
        TextJustification::InterCharacter.as_str(),
        get_text_justification_string(TextJustification::InterCharacter)
    );
}

#[test]
fn text_layout_group_new_matches_free_function_and_preserves_ref() {
    let format = Arc::new(RwLock::new(format()));
    let mut method = TextLayoutGroup::new(format.clone());
    method.start_index = 2;
    method.end_index = 5;
    let mut function = create_text_layout_group(format.clone());
    function.start_index = 2;
    function.end_index = 5;
    assert_eq!(
        (method.start_index, method.end_index),
        (function.start_index, function.end_index)
    );
    assert!(Arc::ptr_eq(&method.format, &function.format));
    assert!(Arc::ptr_eq(&method.format, &format));
}

#[test]
fn text_layout_measure_state_methods_match_free_functions() {
    let explicit: TextMeasureFunction = Arc::new(|text, _| text.len() as f32);
    let mut method = TextLayoutMeasureState::new();
    let mut function = create_text_layout_measure_state();
    method.set_provider(Some(explicit.clone()));
    set_text_layout_measure_provider(&mut function, Some(explicit.clone()));
    let method_provider = method.get_provider(None).unwrap();
    let function_provider = get_text_layout_measure_provider(&function, None).unwrap();
    assert!(Arc::ptr_eq(&method_provider, &function_provider));
    assert!(Arc::ptr_eq(&method_provider, &explicit));
}

#[test]
fn text_layout_result_compute_matches_free_function() {
    let params = params();
    let mut method = TextLayoutResult::new();
    let mut function = create_text_layout_result();
    method.compute(&params);
    compute_text_layout(&mut function, &params);
    assert_eq!(method.num_lines, function.num_lines);
    assert_eq!(method.text_height, function.text_height);
    assert_eq!(method.text_width, function.text_width);
    assert_eq!(method.groups.len(), function.groups.len());
    assert_eq!(method.groups[0].positions, function.groups[0].positions);
}

#[test]
fn text_layout_result_is_truncated_matches_free_function() {
    let mut params = params();
    params.max_lines = Some(1);
    let mut layout = TextLayoutResult::new();
    layout.compute(&params);
    assert_eq!(
        layout.is_truncated(&params),
        is_text_layout_truncated(&layout, &params)
    );
}

#[test]
fn text_layout_result_new_matches_free_function() {
    let method = TextLayoutResult::new();
    let function = create_text_layout_result();
    assert_eq!(method.groups.len(), function.groups.len());
    assert_eq!(method.num_lines, function.num_lines);
    assert_eq!(method.text_height, function.text_height);
    assert_eq!(method.text_width, function.text_width);
}

#[test]
fn text_metrics_methods_match_free_functions() {
    let mut layout = create_text_layout_result();
    layout.num_lines = 3;
    layout.text_height = 8.4;
    layout.text_width = 10.2;
    let mut method = TextMetrics::new();
    let mut function = create_text_metrics();
    method.get(&layout);
    get_text_metrics(&mut function, &layout);
    assert_eq!(method, function);
}

#[test]
fn text_vertical_align_as_str_matches_free_function() {
    assert_eq!(
        TextVerticalAlign::Middle.as_str(),
        get_text_vertical_align_string(TextVerticalAlign::Middle)
    );
}
