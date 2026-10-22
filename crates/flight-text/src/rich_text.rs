use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::Rectangle;
use flight_node::{Node, NodeRef, invalidate_node_local_bounds, invalidate_node_local_content};
use flight_scene2d::{Node2DRuntime, Node2DRuntimeMethods, create_node2d, create_node2d_runtime};
use flight_signals::{create_signal, emit_signal};
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textlayout::{
    RichTextContent, TextAutoSize, TextBoundsSpec, TextLayoutParams, TextLayoutResult,
    TextLineMetrics, TextVerticalAlign, compute_rich_text_char_index_at_point,
    compute_rich_text_line_metrics, compute_text_bounds_rectangle, create_text_format_range,
    get_rich_text_link_at_point, merge_text_format,
};
use flight_textshaper::TextMeasureFunction;

use crate::rich_text_content::{compute_rich_text_content, get_rich_text_content};
use crate::rich_text_metrics::*;
use crate::text_label::create_text_label_runtime;
use crate::text_label_layout::get_text_layout_for_node;
use crate::types::*;

pub fn create_rich_text(obj: Option<&PartialRichText>) -> Ref<RichText> {
    let mut out: RichText = create_node2d(
        RICH_TEXT_KIND.to_string(),
        obj.map(|obj| &obj.node),
        Some(create_rich_text_node2d_runtime),
    );
    out.data = create_rich_text_data();
    if let Some(data) = obj.and_then(|obj| obj.data.as_ref()) {
        assign_rich_text_data_options(&mut out.data, data);
    }
    let runtime = create_rich_text_runtime();
    if let Some(context) = obj.and_then(|obj| obj.layout_context.clone()) {
        runtime.text_label.write().unwrap().layout_context = context;
    }
    out.rich_text_runtime = Arc::new(RwLock::new(runtime));
    return flight_scene2d::publish_node2d(out);
}

// flight-lint: allow(conform-params) D23 (B) zero-field constructor (Principal 3139d09f); callers assign authored fields after create
pub fn create_rich_text_data() -> RichTextData {
    let mut out: RichTextData = allocate_entity();
    initialize_rich_text_data(&mut out);
    return out;
}

fn create_rich_text_node2d_runtime() -> Node2DRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(compute_rich_text_local_bounds_rectangle)),
        is_local_bounds_rectangle_valid: None,
    };
    return create_node2d_runtime(Some(&methods));
}

pub fn create_rich_text_runtime() -> RichTextRuntime {
    let mut text_label = create_text_label_runtime();
    text_label.build_text_layout_params = Arc::new(build_rich_text_layout_params_for_node);
    return RichTextRuntime {
        input: None,
        rich_text_content: None,
        selection_begin_index: 0,
        selection_end_index: 0,
        text_field_signals: None,
        text_label: Arc::new(RwLock::new(text_label)),
    };
}

pub fn create_text_field_signals() -> TextFieldSignals {
    let mut out: TextFieldSignals = allocate_entity();
    initialize_text_field_signals(&mut out);
    return out;
}

/// Resets rich-text data to the source defaults (TS `createRichTextData`, the label defaults plus
/// the field's own); the construction initializer of `create_rich_text_data` (D23 I).
// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source createRichTextData
pub fn initialize_rich_text_data(out: &mut RichTextData) {
    out.auto_size = TextAutoSize::None;
    out.background = false;
    out.background_color = 0xffff_ffff;
    out.border = false;
    out.border_color = 0x0000_00ff;
    out.condense_white = false;
    out.default_text_format = empty_format();
    out.height = 100.0;
    out.max_chars = -1;
    out.mouse_wheel_enabled = true;
    out.multiline = true;
    out.scroll_h = 0.0;
    out.scroll_v = 1.0;
    out.selectable = true;
    out.text = String::new();
    out.text_color = 0x0000_00ff;
    out.text_format = empty_format();
    out.text_format_ranges = Vec::new();
    out.vertical_align = TextVerticalAlign::Top;
    out.width = 100.0;
    out.word_wrap = false;
}

pub fn initialize_text_field_signals(out: &mut TextFieldSignals) {
    out.on_text_field_change = create_signal();
    out.on_text_field_link = create_signal();
    out.on_text_field_scroll = create_signal();
}

fn add_signed(value: usize, delta: isize) -> usize {
    return if delta < 0 {
        value.saturating_sub((-delta) as usize)
    } else {
        value + delta as usize
    };
}

pub fn append_rich_text_string(source: &Ref<RichText>, value: &str) {
    if value.is_empty() {
        return;
    }
    let previous_text = {
        let mut source = source.write().unwrap();
        let previous = source.data.text.clone();
        source.data.text.push_str(value);
        previous
    };
    invalidate_rich_text_content(source);
    emit_text_field_change(source, previous_text);
}

// The entity constructor still takes its partial (the RichText entity arc follows the Node2D
// construction change); it assigns the supplied data fields after the zero-field create.
fn assign_rich_text_data_options(out: &mut RichTextData, data: &RichTextDataOptions) {
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

fn bounds_spec(data: &RichTextData) -> TextBoundsSpec {
    return TextBoundsSpec {
        auto_size: data.auto_size,
        height: data.height,
        width: data.width,
        word_wrap: Some(data.word_wrap),
    };
}

pub fn build_rich_text_layout_params(
    source: &RichText,
    measure: TextMeasureFunction,
) -> TextLayoutParams {
    let runtime = source.rich_text_runtime.clone();
    let content = {
        let mut runtime = runtime.write().unwrap();
        get_rich_text_content(&mut runtime)
    };
    let password_character = get_rich_text_password_character(source);
    compute_rich_text_content(
        &mut content.write().unwrap(),
        &source.data,
        password_character.as_deref(),
    );
    let content = content.read().unwrap();
    return TextLayoutParams {
        auto_size: None,
        border: None,
        direction: None,
        format_ranges: content.format_ranges.clone(),
        height: source.data.height,
        justification: None,
        max_lines: None,
        measure,
        multiline: Some(source.data.multiline),
        text: content.text.clone(),
        truncation_character: None,
        vertical_align: Some(if source.data.auto_size == TextAutoSize::None {
            source.data.vertical_align
        } else {
            TextVerticalAlign::Top
        }),
        width: if source.data.word_wrap {
            source.data.width
        } else {
            10_000.0
        },
        word_wrap: Some(source.data.word_wrap),
    };
}

fn build_rich_text_layout_params_for_node(
    source: &dyn Node,
    measure: TextMeasureFunction,
) -> Option<TextLayoutParams> {
    let source = source.as_any().downcast_ref::<RichText>()?;
    return Some(build_rich_text_layout_params(source, measure));
}

pub fn clear_rich_text_format_ranges(source: &Ref<RichText>) {
    source.write().unwrap().data.text_format_ranges.clear();
    invalidate_rich_text_content(source);
}

fn compute_max_scroll_h_from_layout(data: &RichTextData, layout: &TextLayoutResult) -> f32 {
    let field_width = if data.auto_size == TextAutoSize::None || data.word_wrap {
        data.width
    } else {
        layout.text_width + 4.0
    };
    return (layout.text_width - (field_width - 4.0).max(0.0))
        .ceil()
        .max(0.0);
}

fn compute_max_scroll_v_from_layout(data: &RichTextData, layout: &TextLayoutResult) -> f32 {
    if layout.num_lines <= 1 {
        return 1.0;
    }
    let field_height = if data.auto_size == TextAutoSize::None {
        data.height
    } else {
        layout.text_height + 4.0
    };
    let visible_height = (field_height - 4.0).max(0.0);
    let mut total = 0.0;
    let mut count = 0;
    for height in &layout.line_heights {
        if count > 0 && total + height > visible_height {
            break;
        }
        total += height;
        count += 1;
    }
    return ((layout.num_lines - count.max(1) + 1) as f32).max(1.0);
}

pub fn compute_rich_text_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    let Some(source) = source.as_any().downcast_ref::<RichText>() else {
        return;
    };
    if source.data.auto_size == TextAutoSize::None {
        set_fixed_bounds(out, source.data.width, source.data.height);
        return;
    }
    let Some(layout) = get_text_layout_for_node(source) else {
        set_fixed_bounds(out, source.data.width, source.data.height);
        return;
    };
    compute_text_bounds_rectangle(out, &bounds_spec(&source.data), &layout.read().unwrap());
}

pub fn dispatch_rich_text_link_at_point(source: &Ref<RichText>, x: f32, y: f32) -> Option<String> {
    let node: NodeRef = source.clone();
    let layout = crate::text_label_layout::get_text_layout(&node)?;
    let url = get_rich_text_link_at_point(&layout.read().unwrap(), x, y);
    if let Some(url) = &url {
        let signals = get_text_field_signals(source);
        if let Some(signals) = signals {
            emit_signal(
                &signals.read().unwrap().on_text_field_link,
                &TextFieldLinkEvent {
                    url: url.clone(),
                    x,
                    y,
                },
            );
        }
    }
    return url;
}

pub fn dispatch_rich_text_wheel(
    source: &Ref<RichText>,
    delta_lines: f32,
    layout: Option<&TextLayoutResult>,
) {
    let scroll_v = source.read().unwrap().data.scroll_v;
    set_rich_text_scroll_v(source, scroll_v + delta_lines.round(), layout);
}

fn emit_text_field_change(source: &Ref<RichText>, previous_text: String) {
    let signals = get_text_field_signals(source);
    let Some(signals) = signals else {
        return;
    };
    let text = source.read().unwrap().data.text.clone();
    emit_signal(
        &signals.read().unwrap().on_text_field_change,
        &TextFieldChangeEvent {
            previous_text,
            text,
        },
    );
}

fn emit_text_field_scroll(source: &Ref<RichText>, previous_scroll_h: f32, previous_scroll_v: f32) {
    let signals = get_text_field_signals(source);
    let Some(signals) = signals else {
        return;
    };
    let source = source.read().unwrap();
    emit_signal(
        &signals.read().unwrap().on_text_field_scroll,
        &TextFieldScrollEvent {
            previous_scroll_h,
            previous_scroll_v,
            scroll_h: source.data.scroll_h,
            scroll_v: source.data.scroll_v,
        },
    );
}

fn empty_format() -> Ref<TextFormat> {
    return Arc::new(RwLock::new(TextFormat::default()));
}

pub fn enable_text_field_signals(source: &Ref<RichText>) -> Ref<TextFieldSignals> {
    let runtime = source.read().unwrap().rich_text_runtime.clone();
    let mut runtime = runtime.write().unwrap();
    if runtime.text_field_signals.is_none() {
        runtime.text_field_signals = Some(Arc::new(RwLock::new(create_text_field_signals())));
    }
    return runtime.text_field_signals.as_ref().unwrap().clone();
}

fn equals_rich_text_content(data: &RichTextData, content: &RichTextContent) -> bool {
    if data.text != content.text || data.text_format_ranges.len() != content.format_ranges.len() {
        return false;
    }
    return data
        .text_format_ranges
        .iter()
        .zip(&content.format_ranges)
        .all(|(current, next)| {
            current.start == next.start
                && current.end == next.end
                && *current.format.read().unwrap() == *next.format.read().unwrap()
        });
}

pub fn get_rich_text_bottom_scroll_v(source: &Ref<RichText>) -> f32 {
    let node: NodeRef = source.clone();
    let Some(layout) = crate::text_label_layout::get_text_layout(&node) else {
        return 1.0;
    };
    return compute_rich_text_bottom_scroll_v(
        &source.read().unwrap().data,
        &layout.read().unwrap(),
    );
}

pub fn get_rich_text_char_index_at_point(source: &Ref<RichText>, x: f32, y: f32) -> i32 {
    let node: NodeRef = source.clone();
    let Some(layout) = crate::text_label_layout::get_text_layout(&node) else {
        return -1;
    };
    return compute_rich_text_char_index_at_point(&layout.read().unwrap(), x, y) as i32;
}

pub fn get_rich_text_default_text_format(source: &RichText) -> Ref<TextFormat> {
    return source.data.default_text_format.clone();
}

pub fn get_rich_text_format_range_at(out: &mut TextFormat, source: &RichText, index: usize) {
    let mut merged = source.data.default_text_format.read().unwrap().clone();
    for range in &source.data.text_format_ranges {
        if index >= range.start && index < range.end {
            merged = merge_text_format(&merged, &range.format.read().unwrap());
        }
    }
    *out = merge_text_format(out, &merged);
}

pub fn get_rich_text_format_range_by_index(
    out: &mut TextFormatRange,
    source: &RichText,
    i: usize,
) -> bool {
    let Some(range) = source.data.text_format_ranges.get(i) else {
        return false;
    };
    out.start = range.start;
    out.end = range.end;
    out.format = range.format.clone();
    return true;
}

pub fn get_rich_text_format_range_count(source: &RichText) -> usize {
    return source.data.text_format_ranges.len();
}

pub fn get_rich_text_format_ranges_in(
    out: &mut Vec<TextFormatRange>,
    source: &RichText,
    begin_index: usize,
    end_index: usize,
) {
    out.clear();
    out.extend(
        source
            .data
            .text_format_ranges
            .iter()
            .filter(|range| range.start < end_index && range.end > begin_index)
            .cloned(),
    );
}

pub fn get_rich_text_length(source: &RichText) -> usize {
    return utf16_len(&source.data.text);
}

pub fn get_rich_text_line_count(source: &Ref<RichText>) -> usize {
    let node: NodeRef = source.clone();
    let Some(layout) = crate::text_label_layout::get_text_layout(&node) else {
        return 0;
    };
    return compute_rich_text_line_count(&layout.read().unwrap());
}

pub fn get_rich_text_line_metrics(
    source: &Ref<RichText>,
    line_index: usize,
) -> Option<TextLineMetrics> {
    let node: NodeRef = source.clone();
    let layout = crate::text_label_layout::get_text_layout(&node)?;
    return compute_rich_text_line_metrics(&layout.read().unwrap(), line_index);
}

pub fn get_rich_text_max_scroll_h(source: &Ref<RichText>) -> f32 {
    let node: NodeRef = source.clone();
    let Some(layout) = crate::text_label_layout::get_text_layout(&node) else {
        return 0.0;
    };
    return compute_rich_text_max_scroll_h(&source.read().unwrap().data, &layout.read().unwrap());
}

pub fn get_rich_text_max_scroll_v(source: &Ref<RichText>) -> f32 {
    let node: NodeRef = source.clone();
    let Some(layout) = crate::text_label_layout::get_text_layout(&node) else {
        return 1.0;
    };
    return compute_rich_text_max_scroll_v(&source.read().unwrap().data, &layout.read().unwrap());
}

pub fn get_rich_text_password_character(source: &RichText) -> Option<String> {
    let runtime = source.rich_text_runtime.read().unwrap();
    let input = runtime.input.as_ref()?.read().unwrap();
    if input.display_as_password {
        return Some(input.password_character.clone());
    }
    return None;
}

pub fn get_rich_text_runtime(source: &RichText) -> Ref<RichTextRuntime> {
    return source.rich_text_runtime.clone();
}

pub fn get_rich_text_string(source: &RichText) -> String {
    return source.data.text.clone();
}

pub fn get_rich_text_text_height(source: &Ref<RichText>) -> f32 {
    let node: NodeRef = source.clone();
    let Some(layout) = crate::text_label_layout::get_text_layout(&node) else {
        return 0.0;
    };
    return compute_rich_text_text_height(&layout.read().unwrap());
}

pub fn get_rich_text_text_width(source: &Ref<RichText>) -> f32 {
    let node: NodeRef = source.clone();
    let Some(layout) = crate::text_label_layout::get_text_layout(&node) else {
        return 0.0;
    };
    return compute_rich_text_text_width(&layout.read().unwrap());
}

pub fn get_text_field_signals(source: &Ref<RichText>) -> Option<Ref<TextFieldSignals>> {
    let runtime = source.read().unwrap().rich_text_runtime.clone();
    let signals = runtime.read().unwrap().text_field_signals.clone();
    return signals;
}

pub fn insert_rich_text_string(source: &Ref<RichText>, index: i32, value: &str) {
    if value.is_empty() {
        return;
    }
    let previous_text = {
        let mut source = source.write().unwrap();
        let text_length = utf16_len(&source.data.text);
        let clamped_index = index.max(0) as usize;
        let clamped_index = clamped_index.min(text_length);
        let byte_index = utf16_to_byte_index(&source.data.text, clamped_index);
        let previous = source.data.text.clone();
        source.data.text.insert_str(byte_index, value);
        let delta = utf16_len(value);
        for range in &mut source.data.text_format_ranges {
            if range.start >= clamped_index {
                range.start += delta;
                range.end += delta;
            } else if range.end > clamped_index {
                range.end += delta;
            }
        }
        previous
    };
    invalidate_rich_text_content(source);
    emit_text_field_change(source, previous_text);
}

fn invalidate_rich_node_content(source: &Ref<RichText>) {
    let node: NodeRef = source.clone();
    invalidate_node_local_content(&node);
}

fn invalidate_rich_text_content(source: &Ref<RichText>) {
    let auto_size = source.read().unwrap().data.auto_size;
    let node: NodeRef = source.clone();
    invalidate_node_local_content(&node);
    if auto_size != TextAutoSize::None {
        invalidate_node_local_bounds(&node);
    }
}

fn invalidate_rich_text_content_and_bounds(source: &Ref<RichText>) {
    let node: NodeRef = source.clone();
    invalidate_node_local_content(&node);
    invalidate_node_local_bounds(&node);
}

pub fn remove_rich_text_format_ranges_in(source: &Ref<RichText>, begin: usize, end: usize) {
    let changed = {
        let mut source = source.write().unwrap();
        let before = source.data.text_format_ranges.len();
        source
            .data
            .text_format_ranges
            .retain(|range| !(range.start < end && range.end > begin));
        source.data.text_format_ranges.len() != before
    };
    if changed {
        invalidate_rich_text_content(source);
    }
}

pub fn replace_rich_text_string(
    source: &Ref<RichText>,
    begin_index: i32,
    end_index: i32,
    value: &str,
) {
    let (previous_text, changed) = {
        let mut source = source.write().unwrap();
        let text_length = utf16_len(&source.data.text);
        let start = (begin_index.max(0) as usize).min(text_length);
        let end = (end_index.max(0) as usize).min(text_length).max(start);
        let start_byte = utf16_to_byte_index(&source.data.text, start);
        let end_byte = utf16_to_byte_index(&source.data.text, end);
        let previous = source.data.text.clone();
        source.data.text.replace_range(start_byte..end_byte, value);
        let value_length = utf16_len(value);
        let removed_length = end - start;
        let delta = value_length as isize - removed_length as isize;
        let ranges = &mut source.data.text_format_ranges;
        let mut i = ranges.len();
        while i > 0 {
            i -= 1;
            let range = &mut ranges[i];
            if range.start >= end {
                range.start = add_signed(range.start, delta);
                range.end = add_signed(range.end, delta);
            } else if range.end <= start {
            } else if range.start >= start && range.end <= end {
                ranges.remove(i);
            } else if range.start < start && range.end > end {
                range.end = add_signed(range.end, delta);
            } else if range.start < start {
                range.end = start + value_length;
            } else {
                range.start = start + value_length;
                range.end = add_signed(range.end, delta);
            }
        }
        let changed = previous != source.data.text;
        (previous, changed)
    };
    invalidate_rich_text_content(source);
    if changed {
        emit_text_field_change(source, previous_text);
    }
}

fn set_fixed_bounds(out: &mut Rectangle, width: f32, height: f32) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = width;
    out.height = height;
}

fn set_if_changed<T: PartialEq + Copy>(
    source: &Ref<RichText>,
    field: impl FnOnce(&mut RichTextData) -> &mut T,
    value: T,
) -> bool {
    let mut source = source.write().unwrap();
    let field = field(&mut source.data);
    if *field == value {
        return false;
    }
    *field = value;
    return true;
}

pub fn set_rich_text_background(source: &Ref<RichText>, value: bool) {
    if set_if_changed(source, |data| &mut data.background, value) {
        invalidate_rich_node_content(source);
    }
}

pub fn set_rich_text_background_color(source: &Ref<RichText>, value: u32) {
    if set_if_changed(source, |data| &mut data.background_color, value) {
        invalidate_rich_node_content(source);
    }
}

pub fn set_rich_text_border(source: &Ref<RichText>, value: bool) {
    if set_if_changed(source, |data| &mut data.border, value) {
        invalidate_rich_node_content(source);
    }
}

pub fn set_rich_text_border_color(source: &Ref<RichText>, value: u32) {
    if set_if_changed(source, |data| &mut data.border_color, value) {
        invalidate_rich_node_content(source);
    }
}

pub fn set_rich_text_condense_white(source: &Ref<RichText>, value: bool) {
    if set_if_changed(source, |data| &mut data.condense_white, value) {
        invalidate_rich_text_content(source);
    }
}

pub fn set_rich_text_content(source: &Ref<RichText>, content: &RichTextContent) {
    let (previous_text, changed) = {
        let mut source = source.write().unwrap();
        if equals_rich_text_content(&source.data, content) {
            return;
        }
        let previous = source.data.text.clone();
        source.data.text = content.text.clone();
        source.data.text_format_ranges = content.format_ranges.clone();
        let changed = previous != content.text;
        (previous, changed)
    };
    invalidate_rich_text_content(source);
    if changed {
        emit_text_field_change(source, previous_text);
    }
}

pub fn set_rich_text_default_text_format(source: &Ref<RichText>, value: Ref<TextFormat>) {
    {
        let mut source = source.write().unwrap();
        if *source.data.default_text_format.read().unwrap() == *value.read().unwrap() {
            return;
        }
        source.data.default_text_format = value;
    }
    invalidate_rich_text_content(source);
}

pub fn set_rich_text_format_range(
    source: &Ref<RichText>,
    format: Ref<TextFormat>,
    start: Option<usize>,
    end: Option<usize>,
) {
    let changed = {
        let mut source = source.write().unwrap();
        let start = start.unwrap_or(0);
        let end = end.unwrap_or_else(|| utf16_len(&source.data.text));
        if let Some(previous) = source.data.text_format_ranges.last()
            && previous.start == start
            && previous.end == end
            && *previous.format.read().unwrap() == *format.read().unwrap()
        {
            false
        } else {
            source
                .data
                .text_format_ranges
                .push(create_text_format_range(format, start, end));
            true
        }
    };
    if changed {
        invalidate_rich_text_content(source);
    }
}

pub fn set_rich_text_height(source: &Ref<RichText>, value: f32) {
    if set_if_changed(source, |data| &mut data.height, value) {
        invalidate_rich_text_content_and_bounds(source);
    }
}

pub fn set_rich_text_max_chars(source: &Ref<RichText>, value: i32) {
    if set_if_changed(source, |data| &mut data.max_chars, value) {
        invalidate_rich_node_content(source);
    }
}

pub fn set_rich_text_mouse_wheel_enabled(source: &Ref<RichText>, value: bool) {
    if set_if_changed(source, |data| &mut data.mouse_wheel_enabled, value) {
        invalidate_rich_node_content(source);
    }
}

pub fn set_rich_text_multiline(source: &Ref<RichText>, value: bool) {
    if set_if_changed(source, |data| &mut data.multiline, value) {
        invalidate_rich_text_content_and_bounds(source);
    }
}

pub fn set_rich_text_scroll_h(
    source: &Ref<RichText>,
    value: f32,
    layout: Option<&TextLayoutResult>,
) {
    let max = layout
        .map(|layout| compute_max_scroll_h_from_layout(&source.read().unwrap().data, layout))
        .unwrap_or(f32::INFINITY);
    let clamped = value.round().min(max).max(0.0);
    set_scroll(source, Some(clamped), None);
}

pub fn set_rich_text_scroll_v(
    source: &Ref<RichText>,
    value: f32,
    layout: Option<&TextLayoutResult>,
) {
    let max = layout
        .map(|layout| compute_max_scroll_v_from_layout(&source.read().unwrap().data, layout))
        .unwrap_or(f32::INFINITY);
    let clamped = value.round().min(max).max(1.0);
    set_scroll(source, None, Some(clamped));
}

pub fn set_rich_text_selectable(source: &Ref<RichText>, value: bool) {
    if set_if_changed(source, |data| &mut data.selectable, value) {
        invalidate_rich_node_content(source);
    }
}

pub fn set_rich_text_string(source: &Ref<RichText>, value: &str) {
    let previous_text = {
        let mut source = source.write().unwrap();
        if source.data.text == value {
            return;
        }
        let previous = source.data.text.clone();
        source.data.text = value.to_string();
        previous
    };
    invalidate_rich_text_content(source);
    emit_text_field_change(source, previous_text);
}

pub fn set_rich_text_text_color(source: &Ref<RichText>, value: u32) {
    if set_if_changed(source, |data| &mut data.text_color, value) {
        invalidate_rich_node_content(source);
    }
}

pub fn set_rich_text_vertical_align(source: &Ref<RichText>, value: TextVerticalAlign) {
    if set_if_changed(source, |data| &mut data.vertical_align, value) {
        invalidate_rich_node_content(source);
    }
}

pub fn set_rich_text_width(source: &Ref<RichText>, value: f32) {
    if set_if_changed(source, |data| &mut data.width, value) {
        invalidate_rich_text_content_and_bounds(source);
    }
}

pub fn set_rich_text_word_wrap(source: &Ref<RichText>, value: bool) {
    if set_if_changed(source, |data| &mut data.word_wrap, value) {
        invalidate_rich_text_content_and_bounds(source);
    }
}

fn set_scroll(source: &Ref<RichText>, scroll_h: Option<f32>, scroll_v: Option<f32>) {
    let (previous_scroll_h, previous_scroll_v, changed) = {
        let mut source = source.write().unwrap();
        let previous_h = source.data.scroll_h;
        let previous_v = source.data.scroll_v;
        if let Some(scroll_h) = scroll_h {
            source.data.scroll_h = scroll_h;
        }
        if let Some(scroll_v) = scroll_v {
            source.data.scroll_v = scroll_v;
        }
        (
            previous_h,
            previous_v,
            previous_h != source.data.scroll_h || previous_v != source.data.scroll_v,
        )
    };
    if !changed {
        return;
    }
    invalidate_rich_node_content(source);
    emit_text_field_scroll(source, previous_scroll_h, previous_scroll_v);
}

fn utf16_len(value: &str) -> usize {
    return value.encode_utf16().count();
}

fn utf16_to_byte_index(value: &str, utf16_index: usize) -> usize {
    let mut units = 0;
    for (byte_index, character) in value.char_indices() {
        if units >= utf16_index {
            return byte_index;
        }
        units += character.len_utf16();
        if units > utf16_index {
            return byte_index;
        }
    }
    return value.len();
}
