use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::Rectangle;
use flight_node::{Node, NodeRef, invalidate_node_local_bounds, invalidate_node_local_content};
use flight_scene2d::{Node2DRuntime, Node2DRuntimeMethods, create_node2d, create_node2d_runtime};
use flight_textlayout::{TextAutoSize, TextVerticalAlign};

use crate::types::*;

pub fn create_native_text(obj: Option<&PartialNativeText>) -> Ref<NativeText> {
    let mut out: NativeText = create_node2d(
        NATIVE_TEXT_KIND.to_string(),
        obj.map(|obj| &obj.node),
        Some(create_native_text_node2d_runtime),
    );
    out.data = create_native_text_data(obj.and_then(|obj| obj.data.as_ref()));
    out.native_text_runtime = Arc::new(RwLock::new(create_native_text_runtime()));
    return Arc::new(RwLock::new(out));
}

pub fn create_native_text_data(data: Option<&NativeTextDataOptions>) -> NativeTextData {
    let mut out: NativeTextData = allocate_entity();
    initialize_native_text_data(&mut out, data);
    return out;
}

fn create_native_text_node2d_runtime() -> Node2DRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(compute_native_text_local_bounds_rectangle)),
        is_local_bounds_rectangle_valid: None,
    };
    return create_node2d_runtime(Some(&methods));
}

pub fn create_native_text_runtime() -> NativeTextRuntime {
    return NativeTextRuntime::default();
}

pub fn initialize_native_text_data(out: &mut NativeTextData, data: Option<&NativeTextDataOptions>) {
    out.auto_size = data
        .and_then(|data| data.auto_size)
        .unwrap_or(TextAutoSize::None);
    out.height = data.and_then(|data| data.height).unwrap_or(100.0);
    out.style = data
        .and_then(|data| data.style.clone())
        .unwrap_or_else(|| Arc::new(RwLock::new(NativeTextStyle::default())));
    out.text = data.and_then(|data| data.text.clone()).unwrap_or_default();
    out.vertical_align = data
        .and_then(|data| data.vertical_align)
        .unwrap_or(TextVerticalAlign::Top);
    out.width = data.and_then(|data| data.width).unwrap_or(100.0);
}

fn apply_style_patch(out: &mut NativeTextStyle, patch: &NativeTextStyle) {
    if patch.align.is_some() {
        out.align = patch.align;
    }
    if patch.bold.is_some() {
        out.bold = patch.bold;
    }
    if patch.color.is_some() {
        out.color = patch.color;
    }
    if patch.font.is_some() {
        out.font = patch.font.clone();
    }
    if patch.italic.is_some() {
        out.italic = patch.italic;
    }
    if patch.leading.is_some() {
        out.leading = patch.leading;
    }
    if patch.size.is_some() {
        out.size = patch.size;
    }
}

pub fn compute_native_text_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    let Some(source) = source.as_any().downcast_ref::<NativeText>() else {
        return;
    };
    out.x = 0.0;
    out.y = 0.0;
    if source.data.auto_size == TextAutoSize::None {
        out.width = source.data.width;
        out.height = source.data.height;
        return;
    }
    let runtime = source.native_text_runtime.read().unwrap();
    out.width = if runtime.measured_width > 0.0 {
        runtime.measured_width
    } else {
        source.data.width
    };
    out.height = if runtime.measured_height > 0.0 {
        runtime.measured_height
    } else {
        source.data.height
    };
}

pub fn get_native_text_measured_height(source: &NativeText) -> f32 {
    return source.native_text_runtime.read().unwrap().measured_height;
}

pub fn get_native_text_measured_width(source: &NativeText) -> f32 {
    return source.native_text_runtime.read().unwrap().measured_width;
}

pub fn get_native_text_runtime(source: &NativeText) -> Ref<NativeTextRuntime> {
    return source.native_text_runtime.clone();
}

pub fn get_native_text_string(source: &NativeText) -> String {
    return source.data.text.clone();
}

pub fn get_native_text_style(source: &NativeText) -> Ref<NativeTextStyle> {
    return source.data.style.clone();
}

fn invalidate_native_text_content_and_bounds(source: &Ref<NativeText>) {
    let node: NodeRef = source.clone();
    invalidate_node_local_content(&node);
    invalidate_node_local_bounds(&node);
}

pub fn patch_native_text_style(source: &Ref<NativeText>, patch: &NativeTextStyle) {
    let style = source.read().unwrap().data.style.clone();
    let mut next = style.read().unwrap().clone();
    apply_style_patch(&mut next, patch);
    source.write().unwrap().data.style = Arc::new(RwLock::new(next));
    invalidate_native_text_content_and_bounds(source);
}

pub fn set_native_text_auto_size(source: &Ref<NativeText>, value: TextAutoSize) {
    {
        let mut source = source.write().unwrap();
        if source.data.auto_size == value {
            return;
        }
        source.data.auto_size = value;
    }
    invalidate_native_text_content_and_bounds(source);
}

pub fn set_native_text_height(source: &Ref<NativeText>, value: f32) {
    {
        let mut source = source.write().unwrap();
        if source.data.height == value {
            return;
        }
        source.data.height = value;
    }
    invalidate_native_text_content_and_bounds(source);
}

pub fn set_native_text_string(source: &Ref<NativeText>, value: &str) {
    {
        let mut source = source.write().unwrap();
        if source.data.text == value {
            return;
        }
        source.data.text = value.to_string();
    }
    invalidate_native_text_content_and_bounds(source);
}

pub fn set_native_text_style(source: &Ref<NativeText>, value: Ref<NativeTextStyle>) {
    source.write().unwrap().data.style = value;
    invalidate_native_text_content_and_bounds(source);
}

pub fn set_native_text_vertical_align(source: &Ref<NativeText>, value: TextVerticalAlign) {
    {
        let mut source = source.write().unwrap();
        if source.data.vertical_align == value {
            return;
        }
        source.data.vertical_align = value;
    }
    let node: NodeRef = source.clone();
    invalidate_node_local_content(&node);
}

pub fn set_native_text_width(source: &Ref<NativeText>, value: f32) {
    {
        let mut source = source.write().unwrap();
        if source.data.width == value {
            return;
        }
        source.data.width = value;
    }
    invalidate_native_text_content_and_bounds(source);
}
