use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_input::InputKeyboardData;
use flight_scene2d::PartialNode2D;
use flight_text::contract::{PartialRichText, RichTextRuntime, get_rich_text_runtime};
use flight_text::{RichText, RichTextDataOptions, TextInputOptions, create_rich_text};
use flight_textformat::TextFormat;
use flight_textinput::contract::enable_text_input;
use flight_textlayout::{TextLayoutResult, create_text_layout_group, create_text_layout_result};

pub fn create_input(data: RichTextDataOptions, options: TextInputOptions) -> Ref<RichText> {
    let text = create_rich_text(Some(&PartialRichText {
        data: Some(data),
        layout_context: None,
        node: partial_node2d(),
    }));
    enable_text_input(&text, Some(&options));
    return text;
}

pub fn create_layout() -> TextLayoutResult {
    let format = format_ref(empty_text_format());
    let mut first = create_text_layout_group(format.clone(), 0, 3);
    first.ascent = 10.0;
    first.descent = 2.0;
    first.height = 12.0;
    first.line_index = 0;
    first.offset_x = 2.0;
    first.offset_y = 2.0;
    first.positions = vec![10.0, 10.0, 10.0];
    first.width = 30.0;
    let mut second = create_text_layout_group(format, 3, 7);
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
    let mut group = create_text_layout_group(format_ref(empty_text_format()), 0, 11);
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
        let mut group = create_text_layout_group(format.clone(), line, line + 1);
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

pub fn partial_node2d() -> PartialNode2D {
    return PartialNode2D {
        alpha: None,
        blend_mode: None,
        clip: None,
        enabled: None,
        material: None,
        material_data: None,
        name: None,
        pivot_x: None,
        pivot_y: None,
        rotation: None,
        scale_x: None,
        scale_y: None,
        skew_x: None,
        skew_y: None,
        visible: None,
        x: None,
        y: None,
    };
}

pub fn rich_text_options() -> RichTextDataOptions {
    return RichTextDataOptions {
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
    let runtime = runtime(source);
    let text_label = runtime.read().unwrap().text_label.clone();
    text_label.write().unwrap().text_layout = Some(Arc::new(RwLock::new(layout)));
}
