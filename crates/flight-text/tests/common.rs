use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_text::contract::{RichTextData, create_rich_text_data};
use flight_textformat::contract::create_text_format_range;
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textlayout::contract::{TextLayoutResult, create_text_layout_result};

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

pub fn format_ref(format: TextFormat) -> Ref<TextFormat> {
    return Arc::new(RwLock::new(format));
}

pub fn format_range(format: TextFormat, start: usize, end: usize) -> TextFormatRange {
    return create_text_format_range(format_ref(format), start, end);
}

pub fn rich_text_data() -> RichTextData {
    return create_rich_text_data();
}

pub fn text_layout_result() -> TextLayoutResult {
    return create_text_layout_result();
}
