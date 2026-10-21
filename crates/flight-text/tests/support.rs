use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_textformat::TextFormat;
use flight_textlayout::contract::{
    TextLayoutResult, create_text_layout_result, set_text_layout_measure_provider,
};
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
    return create_text_label(Some(&PartialTextLabel {
        data: Some(TextLabelDataOptions {
            auto_size: None,
            height: None,
            text: Some(text.to_string()),
            text_format: None,
            vertical_align: None,
            width: None,
        }),
        layout_context: Some(measured_text_context()),
        node: partial_node2d(),
    }));
}

pub fn native_text_options() -> NativeTextDataOptions {
    return NativeTextDataOptions {
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

pub fn partial_node2d() -> flight_scene2d::PartialNode2D {
    return flight_scene2d::PartialNode2D {
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

pub fn rich_text_data() -> RichTextData {
    return create_rich_text_data(None);
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

pub fn text_label_options() -> TextLabelDataOptions {
    return TextLabelDataOptions {
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
