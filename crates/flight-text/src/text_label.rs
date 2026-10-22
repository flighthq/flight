use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::Rectangle;
use flight_node::{Node, NodeRef, invalidate_node_local_bounds, invalidate_node_local_content};
use flight_scene2d::{Node2DRuntime, Node2DRuntimeMethods, create_node2d, create_node2d_runtime};
use flight_textformat::TextFormat;
use flight_textlayout::{
    TextAutoSize, TextBoundsSpec, TextLayoutParams, TextVerticalAlign,
    compute_text_bounds_rectangle, create_text_format_range,
};
use flight_textshaper::TextMeasureFunction;

use crate::text_label_layout::get_text_layout_for_node;
use crate::text_layout_context::create_text_layout_context;
use crate::types::*;

pub fn create_text_label(obj: Option<&PartialTextLabel>) -> Ref<TextLabel> {
    let mut out: TextLabel = create_node2d(
        TEXT_LABEL_KIND.to_string(),
        obj.map(|obj| &obj.node),
        Some(create_text_label_node2d_runtime),
    );
    out.data = create_text_label_data();
    if let Some(data) = obj.and_then(|obj| obj.data.as_ref()) {
        assign_text_label_data_options(&mut out.data, data);
    }
    let mut runtime = create_text_label_runtime();
    if let Some(context) = obj.and_then(|obj| obj.layout_context.clone()) {
        runtime.layout_context = context;
    }
    out.text_label_runtime = Arc::new(RwLock::new(runtime));
    return flight_scene2d::publish_node2d(out);
}

// flight-lint: allow(conform-params) D23 (B) zero-field constructor (Principal 3139d09f); callers assign authored fields after create
pub fn create_text_label_data() -> TextLabelData {
    let mut out: TextLabelData = allocate_entity();
    initialize_text_label_data(&mut out);
    return out;
}

fn create_text_label_node2d_runtime() -> Node2DRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(compute_text_label_local_bounds_rectangle)),
        is_local_bounds_rectangle_valid: None,
    };
    return create_node2d_runtime(Some(&methods));
}

pub fn create_text_label_runtime() -> TextLabelRuntime {
    return TextLabelRuntime {
        build_text_layout_params: Arc::new(build_text_label_layout_params),
        layout_context: create_text_layout_context(None),
        text_layout: None,
        text_layout_using_content_id: -1,
        text_layout_using_text: None,
    };
}

// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f); callers assign authored fields after create
pub fn initialize_text_label_data(out: &mut TextLabelData) {
    out.auto_size = TextAutoSize::None;
    out.height = 100.0;
    out.text = String::new();
    out.text_format = Arc::new(RwLock::new(TextFormat::default()));
    out.vertical_align = TextVerticalAlign::Top;
    out.width = 100.0;
}

pub fn append_text_label_string(source: &Ref<TextLabel>, value: &str) {
    if value.is_empty() {
        return;
    }
    source.write().unwrap().data.text.push_str(value);
    invalidate_text_label_content(source);
}

// The entity constructor still takes its partial (the TextLabel entity arc follows the Node2D
// construction change); it assigns the supplied data fields after the zero-field create.
fn assign_text_label_data_options(out: &mut TextLabelData, data: &TextLabelDataOptions) {
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

fn build_text_label_layout_params(
    source: &dyn Node,
    measure: TextMeasureFunction,
) -> Option<TextLayoutParams> {
    let source = source.as_any().downcast_ref::<TextLabel>()?;
    let data = &source.data;
    return Some(TextLayoutParams {
        auto_size: None,
        border: None,
        direction: None,
        format_ranges: vec![create_text_format_range(
            data.text_format.clone(),
            0,
            data.text.encode_utf16().count(),
        )],
        height: data.height,
        justification: None,
        max_lines: None,
        measure,
        multiline: None,
        text: data.text.clone(),
        truncation_character: None,
        vertical_align: Some(if data.auto_size == TextAutoSize::None {
            data.vertical_align
        } else {
            TextVerticalAlign::Top
        }),
        width: data.width,
        word_wrap: None,
    });
}

pub fn compute_text_label_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    let Some(label) = source.as_any().downcast_ref::<TextLabel>() else {
        return;
    };
    let data = &label.data;
    if data.auto_size == TextAutoSize::None {
        set_fixed_bounds(out, data.width, data.height);
        return;
    }
    let Some(layout) = get_text_layout_for_node(label) else {
        set_fixed_bounds(out, data.width, data.height);
        return;
    };
    let spec = TextBoundsSpec {
        auto_size: data.auto_size,
        height: data.height,
        width: data.width,
        word_wrap: None,
    };
    compute_text_bounds_rectangle(out, &spec, &layout.read().unwrap());
}

pub fn get_text_label_format(source: &TextLabel) -> Ref<TextFormat> {
    return source.data.text_format.clone();
}

pub fn get_text_label_runtime(source: &TextLabel) -> Ref<TextLabelRuntime> {
    return source.text_label_runtime.clone();
}

pub fn get_text_label_string(source: &TextLabel) -> String {
    return source.data.text.clone();
}

fn invalidate_text_label_content(source: &Ref<TextLabel>) {
    let auto_size = source.read().unwrap().data.auto_size;
    let node: NodeRef = source.clone();
    invalidate_node_local_content(&node);
    if auto_size != TextAutoSize::None {
        invalidate_node_local_bounds(&node);
    }
}

fn invalidate_text_label_content_and_bounds(source: &Ref<TextLabel>) {
    let node: NodeRef = source.clone();
    invalidate_node_local_content(&node);
    invalidate_node_local_bounds(&node);
}

fn set_fixed_bounds(out: &mut Rectangle, width: f32, height: f32) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = width;
    out.height = height;
}

pub fn set_text_label_auto_size(source: &Ref<TextLabel>, value: TextAutoSize) {
    {
        let mut label = source.write().unwrap();
        if label.data.auto_size == value {
            return;
        }
        label.data.auto_size = value;
    }
    invalidate_text_label_content_and_bounds(source);
}

pub fn set_text_label_format(source: &Ref<TextLabel>, value: Ref<TextFormat>) {
    source.write().unwrap().data.text_format = value;
    invalidate_text_label_content(source);
}

pub fn set_text_label_height(source: &Ref<TextLabel>, value: f32) {
    {
        let mut label = source.write().unwrap();
        if label.data.height == value {
            return;
        }
        label.data.height = value;
    }
    invalidate_text_label_content_and_bounds(source);
}

pub fn set_text_label_string(source: &Ref<TextLabel>, value: &str) {
    {
        let mut label = source.write().unwrap();
        if label.data.text == value {
            return;
        }
        label.data.text = value.to_string();
    }
    invalidate_text_label_content(source);
}

pub fn set_text_label_vertical_align(source: &Ref<TextLabel>, value: TextVerticalAlign) {
    {
        let mut label = source.write().unwrap();
        if label.data.vertical_align == value {
            return;
        }
        label.data.vertical_align = value;
    }
    let node: NodeRef = source.clone();
    invalidate_node_local_content(&node);
}

pub fn set_text_label_width(source: &Ref<TextLabel>, value: f32) {
    {
        let mut label = source.write().unwrap();
        if label.data.width == value {
            return;
        }
        label.data.width = value;
    }
    invalidate_text_label_content_and_bounds(source);
}
