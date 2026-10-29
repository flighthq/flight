use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_textformat::create_text_format_range;
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textlayout::contract::*;
use flight_textshaper::TextMeasureFunction;

pub fn empty_text_format() -> TextFormat {
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
        size: None,
        strikethrough: None,
        tab_stops: None,
        target: None,
        underline: None,
        url: None,
        variations: None,
    };
}

pub fn fixed_measure() -> TextMeasureFunction {
    return Arc::new(|text: &str, _format: &TextFormat| text.encode_utf16().count() as f32 * 10.0);
}

pub fn format_ref(format: TextFormat) -> Ref<TextFormat> {
    return Arc::new(RwLock::new(format));
}

pub fn single_range_params(text: &str, width: f32) -> TextLayoutParams {
    let mut value = empty_text_format();
    value.size = Some(16.0);
    let format = format_ref(value);
    return TextLayoutParams {
        auto_size: None,
        border: None,
        direction: None,
        format_ranges: vec![create_text_format_range(
            format,
            0,
            text.encode_utf16().count(),
        )],
        height: 1000.0,
        justification: None,
        max_lines: None,
        measure: fixed_measure(),
        multiline: None,
        text: text.to_string(),
        truncation_character: None,
        vertical_align: None,
        width,
        word_wrap: None,
    };
}

pub fn range(format: TextFormat, start: usize, end: usize) -> TextFormatRange {
    return create_text_format_range(format_ref(format), start, end);
}
