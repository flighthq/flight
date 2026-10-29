use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_input::InputKeyboardData;
use flight_node::NodeRef;
use flight_text::contract::{
    RichTextRuntime, TextLayoutContext, get_rich_text_runtime, set_text_layout_result,
};
use flight_text::{RichText, RichTextData, TextInputOptions, create_rich_text};
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textinput::contract::enable_text_input;
use flight_textlayout::{
    TextAutoSize, TextLayoutResult, TextVerticalAlign, create_text_layout_group,
    create_text_layout_result,
};

pub fn create_input(data: TestRichTextData, options: TextInputOptions) -> Ref<RichText> {
    let text = create_test_rich_text(Some(&TestRichText {
        data: Some(data),
        layout_context: None,
    }));
    enable_text_input(&text, Some(&options));
    return text;
}

pub fn create_layout() -> TextLayoutResult {
    let format = format_ref(empty_text_format());
    let mut first = create_text_layout_group(format.clone());
    first.start_index = 0;
    first.end_index = 3;
    first.ascent = 10.0;
    first.descent = 2.0;
    first.height = 12.0;
    first.line_index = 0;
    first.offset_x = 2.0;
    first.offset_y = 2.0;
    first.positions = vec![10.0, 10.0, 10.0];
    first.width = 30.0;
    let mut second = create_text_layout_group(format);
    second.start_index = 3;
    second.end_index = 7;
    second.ascent = 10.0;
    second.descent = 2.0;
    second.height = 12.0;
    second.line_index = 1;
    second.offset_x = 2.0;
    second.offset_y = 14.0;
    second.positions = vec![10.0, 10.0, 10.0, 10.0];
    second.width = 40.0;
    let mut layout = create_text_layout_result();
    layout.groups = vec![first, second];
    layout.line_ascents = vec![10.0, 10.0];
    layout.line_descents = vec![2.0, 2.0];
    layout.line_heights = vec![12.0, 12.0];
    layout.line_leadings = vec![0.0, 0.0];
    layout.line_widths = vec![30.0, 40.0];
    layout.num_lines = 2;
    layout.text_height = 24.0;
    layout.text_width = 40.0;
    return layout;
}

pub fn create_single_line_layout() -> TextLayoutResult {
    let mut group = create_text_layout_group(format_ref(empty_text_format()));
    group.start_index = 0;
    group.end_index = 11;
    group.ascent = 10.0;
    group.descent = 2.0;
    group.height = 12.0;
    group.line_index = 0;
    group.offset_x = 2.0;
    group.offset_y = 2.0;
    group.positions = vec![10.0; 11];
    group.width = 110.0;
    let mut layout = create_text_layout_result();
    layout.groups = vec![group];
    layout.line_ascents = vec![10.0];
    layout.line_descents = vec![2.0];
    layout.line_heights = vec![12.0];
    layout.line_leadings = vec![0.0];
    layout.line_widths = vec![110.0];
    layout.num_lines = 1;
    layout.text_height = 12.0;
    layout.text_width = 110.0;
    return layout;
}

pub fn create_tall_layout() -> TextLayoutResult {
    let format = format_ref(empty_text_format());
    let mut groups = Vec::new();
    for line in 0..4 {
        let mut group = create_text_layout_group(format.clone());
        group.start_index = line;
        group.end_index = line + 1;
        group.ascent = 10.0;
        group.descent = 2.0;
        group.height = 12.0;
        group.line_index = line;
        group.offset_x = 2.0;
        group.offset_y = 2.0 + line as f32 * 12.0;
        group.positions = vec![10.0];
        group.width = 10.0;
        groups.push(group);
    }
    let mut layout = create_text_layout_result();
    layout.groups = groups;
    layout.line_ascents = vec![10.0; 4];
    layout.line_descents = vec![2.0; 4];
    layout.line_heights = vec![12.0; 4];
    layout.line_leadings = vec![0.0; 4];
    layout.line_widths = vec![10.0; 4];
    layout.num_lines = 4;
    layout.text_height = 48.0;
    layout.text_width = 10.0;
    return layout;
}

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

pub fn input_options() -> TextInputOptions {
    return TextInputOptions {
        always_show_selection: None,
        caret_color: None,
        caret_width: None,
        display_as_password: None,
        history_limit: None,
        password_character: None,
        restrict: None,
        selection_alpha: None,
        selection_color: None,
    };
}

pub fn keyboard_data() -> InputKeyboardData {
    return InputKeyboardData {
        alt_key: false,
        caps_lock: false,
        code: String::new(),
        ctrl_key: false,
        key: String::new(),
        key_code: 0,
        location: 0,
        meta_key: false,
        modifier: 0,
        num_lock: false,
        repeat: false,
        shift_key: false,
        time_stamp: 0.0,
    };
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

pub fn runtime(source: &Ref<RichText>) -> Ref<RichTextRuntime> {
    let source = source.read().unwrap();
    return get_rich_text_runtime(&source);
}

pub fn set_layout(source: &Ref<RichText>, layout: TextLayoutResult) {
    let node: NodeRef = source.clone();
    set_text_layout_result(&node, Arc::new(RwLock::new(layout)));
}

// Test scaffolding in the source's `create({ data: {...} })` shape. The canonical constructors take
// no authored options (D23 B), so these create and then assign, the way callers do.

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
