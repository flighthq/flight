//! D18 Rust conveniences for the public text contract.

use flight_entity::Ref;
use flight_geometry::Rectangle;
use flight_node::NodeRef;
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textlayout::{
    RichTextContent, TextAutoSize, TextLayoutParams, TextLayoutResult, TextLineMetrics,
    TextMetrics, TextVerticalAlign,
};
use flight_textshaper::TextMeasureFunction;

use crate::explain_text_label_content::*;
use crate::native_text::*;
use crate::rich_text::*;
use crate::text_format_font::*;
use crate::text_label::*;
use crate::text_label_layout::*;
use crate::types::*;

#[cfg(test)]
#[path = "sugar_tests.rs"]
mod sugar_tests;

impl NativeText {
    pub fn new(obj: Option<&PartialNativeText>) -> Ref<Self> {
        return create_native_text(obj);
    }
}

pub trait NativeTextMethods {
    fn compute_local_bounds_rectangle(&self, out: &mut Rectangle);
    fn measured_height(&self) -> f32;
    fn measured_width(&self) -> f32;
    fn patch_style(&self, patch: &NativeTextStyle);
    fn set_auto_size(&self, value: TextAutoSize);
    fn set_height(&self, value: f32);
    fn set_string(&self, value: &str);
    fn set_style(&self, value: Ref<NativeTextStyle>);
    fn set_vertical_align(&self, value: TextVerticalAlign);
    fn set_width(&self, value: f32);
    fn string(&self) -> String;
    fn style(&self) -> Ref<NativeTextStyle>;
}

impl NativeTextMethods for Ref<NativeText> {
    fn compute_local_bounds_rectangle(&self, out: &mut Rectangle) {
        compute_native_text_local_bounds_rectangle(out, &*self.read().unwrap());
    }

    fn measured_height(&self) -> f32 {
        return get_native_text_measured_height(&self.read().unwrap());
    }

    fn measured_width(&self) -> f32 {
        return get_native_text_measured_width(&self.read().unwrap());
    }

    fn patch_style(&self, patch: &NativeTextStyle) {
        patch_native_text_style(self, patch);
    }

    fn set_auto_size(&self, value: TextAutoSize) {
        set_native_text_auto_size(self, value);
    }

    fn set_height(&self, value: f32) {
        set_native_text_height(self, value);
    }

    fn set_string(&self, value: &str) {
        set_native_text_string(self, value);
    }

    fn set_style(&self, value: Ref<NativeTextStyle>) {
        set_native_text_style(self, value);
    }

    fn set_vertical_align(&self, value: TextVerticalAlign) {
        set_native_text_vertical_align(self, value);
    }

    fn set_width(&self, value: f32) {
        set_native_text_width(self, value);
    }

    fn string(&self) -> String {
        return get_native_text_string(&self.read().unwrap());
    }

    fn style(&self) -> Ref<NativeTextStyle> {
        return get_native_text_style(&self.read().unwrap());
    }
}

impl TextLabel {
    pub fn new(obj: Option<&PartialTextLabel>) -> Ref<Self> {
        return create_text_label(obj);
    }
}

pub trait TextLabelMethods {
    fn append_string(&self, value: &str);
    fn compute_local_bounds_rectangle(&self, out: &mut Rectangle);
    fn format(&self) -> Ref<TextFormat>;
    fn set_auto_size(&self, value: TextAutoSize);
    fn set_format(&self, value: Ref<TextFormat>);
    fn set_height(&self, value: f32);
    fn set_string(&self, value: &str);
    fn set_vertical_align(&self, value: TextVerticalAlign);
    fn set_width(&self, value: f32);
    fn string(&self) -> String;
}

impl TextLabelMethods for Ref<TextLabel> {
    fn append_string(&self, value: &str) {
        append_text_label_string(self, value);
    }

    fn compute_local_bounds_rectangle(&self, out: &mut Rectangle) {
        compute_text_label_local_bounds_rectangle(out, &*self.read().unwrap());
    }

    fn format(&self) -> Ref<TextFormat> {
        return get_text_label_format(&self.read().unwrap());
    }

    fn set_auto_size(&self, value: TextAutoSize) {
        set_text_label_auto_size(self, value);
    }

    fn set_format(&self, value: Ref<TextFormat>) {
        set_text_label_format(self, value);
    }

    fn set_height(&self, value: f32) {
        set_text_label_height(self, value);
    }

    fn set_string(&self, value: &str) {
        set_text_label_string(self, value);
    }

    fn set_vertical_align(&self, value: TextVerticalAlign) {
        set_text_label_vertical_align(self, value);
    }

    fn set_width(&self, value: f32) {
        set_text_label_width(self, value);
    }

    fn string(&self) -> String {
        return get_text_label_string(&self.read().unwrap());
    }
}

impl RichText {
    pub fn new(obj: Option<&PartialRichText>) -> Ref<Self> {
        return create_rich_text(obj);
    }
}

pub trait RichTextMethods {
    fn append_string(&self, value: &str);
    fn bottom_scroll_v(&self) -> f32;
    fn build_layout_params(&self, measure: TextMeasureFunction) -> TextLayoutParams;
    fn char_index_at_point(&self, x: f32, y: f32) -> i32;
    fn clear_format_ranges(&self);
    fn compute_local_bounds_rectangle(&self, out: &mut Rectangle);
    fn default_text_format(&self) -> Ref<TextFormat>;
    fn dispatch_link_at_point(&self, x: f32, y: f32) -> Option<String>;
    fn dispatch_wheel(&self, delta_lines: f32, layout: Option<&TextLayoutResult>);
    fn enable_signals(&self) -> Ref<TextFieldSignals>;
    fn format_range_at(&self, out: &mut TextFormat, index: usize);
    fn format_range_by_index(&self, out: &mut TextFormatRange, index: usize) -> bool;
    fn format_range_count(&self) -> usize;
    fn format_ranges_in(&self, out: &mut Vec<TextFormatRange>, begin: usize, end: usize);
    fn insert_string(&self, index: i32, value: &str);
    fn length(&self) -> usize;
    fn line_count(&self) -> usize;
    fn line_metrics(&self, line_index: usize) -> Option<TextLineMetrics>;
    fn max_scroll_h(&self) -> f32;
    fn max_scroll_v(&self) -> f32;
    fn password_character(&self) -> Option<String>;
    fn remove_format_ranges_in(&self, begin: usize, end: usize);
    fn replace_string(&self, begin: i32, end: i32, value: &str);
    fn set_background(&self, value: bool);
    fn set_background_color(&self, value: u32);
    fn set_border(&self, value: bool);
    fn set_border_color(&self, value: u32);
    fn set_condense_white(&self, value: bool);
    fn set_content(&self, content: &RichTextContent);
    fn set_default_text_format(&self, value: Ref<TextFormat>);
    fn set_format_range(&self, format: Ref<TextFormat>, start: Option<usize>, end: Option<usize>);
    fn set_height(&self, value: f32);
    fn set_max_chars(&self, value: i32);
    fn set_mouse_wheel_enabled(&self, value: bool);
    fn set_multiline(&self, value: bool);
    fn set_scroll_h(&self, value: f32, layout: Option<&TextLayoutResult>);
    fn set_scroll_v(&self, value: f32, layout: Option<&TextLayoutResult>);
    fn set_selectable(&self, value: bool);
    fn set_string(&self, value: &str);
    fn set_text_color(&self, value: u32);
    fn set_vertical_align(&self, value: TextVerticalAlign);
    fn set_width(&self, value: f32);
    fn set_word_wrap(&self, value: bool);
    fn signals(&self) -> Option<Ref<TextFieldSignals>>;
    fn string(&self) -> String;
    fn text_height(&self) -> f32;
    fn text_width(&self) -> f32;
}

impl RichTextMethods for Ref<RichText> {
    fn append_string(&self, value: &str) {
        append_rich_text_string(self, value);
    }

    fn bottom_scroll_v(&self) -> f32 {
        return get_rich_text_bottom_scroll_v(self);
    }

    fn build_layout_params(&self, measure: TextMeasureFunction) -> TextLayoutParams {
        return build_rich_text_layout_params(&self.read().unwrap(), measure);
    }

    fn char_index_at_point(&self, x: f32, y: f32) -> i32 {
        return get_rich_text_char_index_at_point(self, x, y);
    }

    fn clear_format_ranges(&self) {
        clear_rich_text_format_ranges(self);
    }

    fn compute_local_bounds_rectangle(&self, out: &mut Rectangle) {
        compute_rich_text_local_bounds_rectangle(out, &*self.read().unwrap());
    }

    fn default_text_format(&self) -> Ref<TextFormat> {
        return get_rich_text_default_text_format(&self.read().unwrap());
    }

    fn dispatch_link_at_point(&self, x: f32, y: f32) -> Option<String> {
        return dispatch_rich_text_link_at_point(self, x, y);
    }

    fn dispatch_wheel(&self, delta_lines: f32, layout: Option<&TextLayoutResult>) {
        dispatch_rich_text_wheel(self, delta_lines, layout);
    }

    fn enable_signals(&self) -> Ref<TextFieldSignals> {
        return enable_text_field_signals(self);
    }

    fn format_range_at(&self, out: &mut TextFormat, index: usize) {
        get_rich_text_format_range_at(out, &self.read().unwrap(), index);
    }

    fn format_range_by_index(&self, out: &mut TextFormatRange, index: usize) -> bool {
        return get_rich_text_format_range_by_index(out, &self.read().unwrap(), index);
    }

    fn format_range_count(&self) -> usize {
        return get_rich_text_format_range_count(&self.read().unwrap());
    }

    fn format_ranges_in(&self, out: &mut Vec<TextFormatRange>, begin: usize, end: usize) {
        get_rich_text_format_ranges_in(out, &self.read().unwrap(), begin, end);
    }

    fn insert_string(&self, index: i32, value: &str) {
        insert_rich_text_string(self, index, value);
    }

    fn length(&self) -> usize {
        return get_rich_text_length(&self.read().unwrap());
    }

    fn line_count(&self) -> usize {
        return get_rich_text_line_count(self);
    }

    fn line_metrics(&self, line_index: usize) -> Option<TextLineMetrics> {
        return get_rich_text_line_metrics(self, line_index);
    }

    fn max_scroll_h(&self) -> f32 {
        return get_rich_text_max_scroll_h(self);
    }

    fn max_scroll_v(&self) -> f32 {
        return get_rich_text_max_scroll_v(self);
    }

    fn password_character(&self) -> Option<String> {
        return get_rich_text_password_character(&self.read().unwrap());
    }

    fn remove_format_ranges_in(&self, begin: usize, end: usize) {
        remove_rich_text_format_ranges_in(self, begin, end);
    }

    fn replace_string(&self, begin: i32, end: i32, value: &str) {
        replace_rich_text_string(self, begin, end, value);
    }

    fn set_background(&self, value: bool) {
        set_rich_text_background(self, value);
    }

    fn set_background_color(&self, value: u32) {
        set_rich_text_background_color(self, value);
    }

    fn set_border(&self, value: bool) {
        set_rich_text_border(self, value);
    }

    fn set_border_color(&self, value: u32) {
        set_rich_text_border_color(self, value);
    }

    fn set_condense_white(&self, value: bool) {
        set_rich_text_condense_white(self, value);
    }

    fn set_content(&self, content: &RichTextContent) {
        set_rich_text_content(self, content);
    }

    fn set_default_text_format(&self, value: Ref<TextFormat>) {
        set_rich_text_default_text_format(self, value);
    }

    fn set_format_range(&self, format: Ref<TextFormat>, start: Option<usize>, end: Option<usize>) {
        set_rich_text_format_range(self, format, start, end);
    }

    fn set_height(&self, value: f32) {
        set_rich_text_height(self, value);
    }

    fn set_max_chars(&self, value: i32) {
        set_rich_text_max_chars(self, value);
    }

    fn set_mouse_wheel_enabled(&self, value: bool) {
        set_rich_text_mouse_wheel_enabled(self, value);
    }

    fn set_multiline(&self, value: bool) {
        set_rich_text_multiline(self, value);
    }

    fn set_scroll_h(&self, value: f32, layout: Option<&TextLayoutResult>) {
        set_rich_text_scroll_h(self, value, layout);
    }

    fn set_scroll_v(&self, value: f32, layout: Option<&TextLayoutResult>) {
        set_rich_text_scroll_v(self, value, layout);
    }

    fn set_selectable(&self, value: bool) {
        set_rich_text_selectable(self, value);
    }

    fn set_string(&self, value: &str) {
        set_rich_text_string(self, value);
    }

    fn set_text_color(&self, value: u32) {
        set_rich_text_text_color(self, value);
    }

    fn set_vertical_align(&self, value: TextVerticalAlign) {
        set_rich_text_vertical_align(self, value);
    }

    fn set_width(&self, value: f32) {
        set_rich_text_width(self, value);
    }

    fn set_word_wrap(&self, value: bool) {
        set_rich_text_word_wrap(self, value);
    }

    fn signals(&self) -> Option<Ref<TextFieldSignals>> {
        return get_text_field_signals(self);
    }

    fn string(&self) -> String {
        return get_rich_text_string(&self.read().unwrap());
    }

    fn text_height(&self) -> f32 {
        return get_rich_text_text_height(self);
    }

    fn text_width(&self) -> f32 {
        return get_rich_text_text_width(self);
    }
}

pub trait TextNodeMethods {
    fn explain_text_content(&self) -> TextLabelContentExplanation;
    fn layout(&self) -> Option<Ref<TextLayoutResult>>;
    fn layout_metrics(&self, out: &mut TextMetrics);
}

impl TextNodeMethods for NodeRef {
    fn explain_text_content(&self) -> TextLabelContentExplanation {
        return explain_text_label_content(&*self.read().unwrap());
    }

    fn layout(&self) -> Option<Ref<TextLayoutResult>> {
        return get_text_layout(self);
    }

    fn layout_metrics(&self, out: &mut TextMetrics) {
        get_text_layout_metrics(out, self);
    }
}

pub trait TextFormatFontMethods {
    fn font_string(&self) -> String;
}

impl TextFormatFontMethods for TextFormat {
    fn font_string(&self) -> String {
        return compute_text_format_font_string(self);
    }
}
