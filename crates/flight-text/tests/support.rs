use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textlayout::contract::{
    TextLayoutResult, create_text_layout_result, set_text_layout_measure_provider,
};
use flight_textlayout::{TextAutoSize, TextVerticalAlign};
use flight_textshaper::TextMeasureFunction;

use super::*;

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
    return Arc::new(|text, _format| text.encode_utf16().count() as f32 * 7.0);
}

pub fn format_ref(format: TextFormat) -> Ref<TextFormat> {
    return Arc::new(RwLock::new(format));
}

pub fn measured_text_context() -> Ref<TextLayoutContext> {
    let context = create_text_layout_context(None);
    set_text_layout_measure_provider(
        &mut context.write().unwrap().measure_state,
        Some(fixed_measure()),
    );
    return context;
}

pub fn measured_text_label(text: &str) -> Ref<TextLabel> {
    return create_test_text_label(Some(&TestTextLabel {
        data: Some(TestTextLabelData {
            auto_size: None,
            height: None,
            text: Some(text.to_string()),
            text_format: None,
            vertical_align: None,
            width: None,
        }),
        layout_context: Some(measured_text_context()),
    }));
}

pub fn native_text_options() -> TestNativeTextData {
    return TestNativeTextData {
        auto_size: None,
        height: None,
        style: None,
        text: None,
        vertical_align: None,
        width: None,
    };
}

pub fn native_text_style() -> NativeTextStyle {
    return NativeTextStyle {
        align: None,
        bold: None,
        color: None,
        font: None,
        italic: None,
        leading: None,
        size: None,
    };
}

pub fn rich_text_data() -> RichTextData {
    return create_rich_text_data();
}

pub fn rich_text_options() -> TestRichTextData {
    return TestRichTextData {
        auto_size: None,
        background: None,
        background_color: None,
        border: None,
        border_color: None,
        condense_white: None,
        default_text_format: None,
        height: None,
        max_chars: None,
        mouse_wheel_enabled: None,
        multiline: None,
        scroll_h: None,
        scroll_v: None,
        selectable: None,
        text: None,
        text_color: None,
        text_format: None,
        text_format_ranges: None,
        vertical_align: None,
        width: None,
        word_wrap: None,
    };
}

pub fn text_label_options() -> TestTextLabelData {
    return TestTextLabelData {
        auto_size: None,
        height: None,
        text: None,
        text_format: None,
        vertical_align: None,
        width: None,
    };
}

pub fn text_layout_result() -> TextLayoutResult {
    return create_text_layout_result();
}

// Test scaffolding in the source's `create({ data: {...} })` shape. The canonical constructors take
// no authored options (D23 B), so these create and then assign, the way callers do.

#[derive(Clone, Default)]
pub struct TestTextLabelData {
    pub auto_size: Option<TextAutoSize>,
    pub height: Option<f32>,
    pub text: Option<String>,
    pub text_format: Option<Ref<TextFormat>>,
    pub vertical_align: Option<TextVerticalAlign>,
    pub width: Option<f32>,
}

#[derive(Clone, Default)]
pub struct TestTextLabel {
    pub data: Option<TestTextLabelData>,
    pub layout_context: Option<Ref<TextLayoutContext>>,
}

pub fn create_test_text_label(obj: Option<&TestTextLabel>) -> Ref<TextLabel> {
    let label = create_text_label(obj.and_then(|obj| obj.layout_context.clone()));
    if let Some(data) = obj.and_then(|obj| obj.data.as_ref()) {
        assign_test_text_label_data(&mut label.write().unwrap().data, data);
    }
    return label;
}

pub fn assign_test_text_label_data(out: &mut TextLabelData, data: &TestTextLabelData) {
    if let Some(auto_size) = data.auto_size {
        out.auto_size = auto_size;
    }
    if let Some(height) = data.height {
        out.height = height;
    }
    if let Some(text) = &data.text {
        out.text = text.clone();
    }
    if let Some(text_format) = &data.text_format {
        out.text_format = text_format.clone();
    }
    if let Some(vertical_align) = data.vertical_align {
        out.vertical_align = vertical_align;
    }
    if let Some(width) = data.width {
        out.width = width;
    }
}

#[derive(Clone, Default)]
pub struct TestNativeTextData {
    pub auto_size: Option<TextAutoSize>,
    pub height: Option<f32>,
    pub style: Option<Ref<NativeTextStyle>>,
    pub text: Option<String>,
    pub vertical_align: Option<TextVerticalAlign>,
    pub width: Option<f32>,
}

pub fn create_test_native_text(data: Option<&TestNativeTextData>) -> Ref<NativeText> {
    let text = create_native_text();
    if let Some(data) = data {
        assign_test_native_text_data(&mut text.write().unwrap().data, data);
    }
    return text;
}

pub fn assign_test_native_text_data(out: &mut NativeTextData, data: &TestNativeTextData) {
    if let Some(auto_size) = data.auto_size {
        out.auto_size = auto_size;
    }
    if let Some(height) = data.height {
        out.height = height;
    }
    if let Some(style) = &data.style {
        out.style = style.clone();
    }
    if let Some(text) = &data.text {
        out.text = text.clone();
    }
    if let Some(vertical_align) = data.vertical_align {
        out.vertical_align = vertical_align;
    }
    if let Some(width) = data.width {
        out.width = width;
    }
}

#[derive(Clone, Default)]
pub struct TestRichTextData {
    pub auto_size: Option<TextAutoSize>,
    pub background: Option<bool>,
    pub background_color: Option<u32>,
    pub border: Option<bool>,
    pub border_color: Option<u32>,
    pub condense_white: Option<bool>,
    pub default_text_format: Option<Ref<TextFormat>>,
    pub height: Option<f32>,
    pub max_chars: Option<i32>,
    pub mouse_wheel_enabled: Option<bool>,
    pub multiline: Option<bool>,
    pub scroll_h: Option<f32>,
    pub scroll_v: Option<f32>,
    pub selectable: Option<bool>,
    pub text: Option<String>,
    pub text_color: Option<u32>,
    pub text_format: Option<Ref<TextFormat>>,
    pub text_format_ranges: Option<Vec<TextFormatRange>>,
    pub vertical_align: Option<TextVerticalAlign>,
    pub width: Option<f32>,
    pub word_wrap: Option<bool>,
}

#[derive(Clone, Default)]
pub struct TestRichText {
    pub data: Option<TestRichTextData>,
    pub layout_context: Option<Ref<TextLayoutContext>>,
}

pub fn create_test_rich_text(obj: Option<&TestRichText>) -> Ref<RichText> {
    let text = create_rich_text(obj.and_then(|obj| obj.layout_context.clone()));
    if let Some(data) = obj.and_then(|obj| obj.data.as_ref()) {
        assign_test_rich_text_data(&mut text.write().unwrap().data, data);
    }
    return text;
}

pub fn assign_test_rich_text_data(out: &mut RichTextData, data: &TestRichTextData) {
    if let Some(auto_size) = data.auto_size {
        out.auto_size = auto_size;
    }
    if let Some(background) = data.background {
        out.background = background;
    }
    if let Some(background_color) = data.background_color {
        out.background_color = background_color;
    }
    if let Some(border) = data.border {
        out.border = border;
    }
    if let Some(border_color) = data.border_color {
        out.border_color = border_color;
    }
    if let Some(condense_white) = data.condense_white {
        out.condense_white = condense_white;
    }
    if let Some(default_text_format) = &data.default_text_format {
        out.default_text_format = default_text_format.clone();
    }
    if let Some(height) = data.height {
        out.height = height;
    }
    if let Some(max_chars) = data.max_chars {
        out.max_chars = max_chars;
    }
    if let Some(mouse_wheel_enabled) = data.mouse_wheel_enabled {
        out.mouse_wheel_enabled = mouse_wheel_enabled;
    }
    if let Some(multiline) = data.multiline {
        out.multiline = multiline;
    }
    if let Some(scroll_h) = data.scroll_h {
        out.scroll_h = scroll_h;
    }
    if let Some(scroll_v) = data.scroll_v {
        out.scroll_v = scroll_v;
    }
    if let Some(selectable) = data.selectable {
        out.selectable = selectable;
    }
    if let Some(text) = &data.text {
        out.text = text.clone();
    }
    if let Some(text_color) = data.text_color {
        out.text_color = text_color;
    }
    if let Some(text_format) = &data.text_format {
        out.text_format = text_format.clone();
    }
    if let Some(text_format_ranges) = &data.text_format_ranges {
        out.text_format_ranges = text_format_ranges.clone();
    }
    if let Some(vertical_align) = data.vertical_align {
        out.vertical_align = vertical_align;
    }
    if let Some(width) = data.width {
        out.width = width;
    }
    if let Some(word_wrap) = data.word_wrap {
        out.word_wrap = word_wrap;
    }
}
