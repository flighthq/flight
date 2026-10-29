//! flight-compiler: target-native
//! flight-compiler: contract computeNativeTextLocalBoundsRectangle createNativeText createNativeTextData
//! flight-compiler: contract createNativeTextRuntime getNativeTextMeasuredHeight getNativeTextMeasuredWidth
//! flight-compiler: contract getNativeTextRuntime getNativeTextString getNativeTextStyle initializeNativeTextData
//! flight-compiler: contract patchNativeTextStyle setNativeTextAutoSize setNativeTextHeight setNativeTextString
//! flight-compiler: contract setNativeTextStyle setNativeTextVerticalAlign setNativeTextWidth
//! flight-compiler: root-only computeNativeTextLocalBoundsRectangle createNativeText getNativeTextMeasuredHeight getNativeTextMeasuredWidth getNativeTextString getNativeTextStyle patchNativeTextStyle setNativeTextAutoSize setNativeTextHeight setNativeTextString setNativeTextStyle setNativeTextVerticalAlign setNativeTextWidth

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::Rectangle;
use flight_node::{Node, NodeRef, invalidate_node_local_bounds, invalidate_node_local_content};
use flight_scene2d::{Node2DRuntime, Node2DRuntimeMethods, create_node2d, create_node2d_runtime};
use flight_textlayout::{TextAutoSize, TextVerticalAlign};

use crate::types::*;

/// Allocates a NativeText display node (TS `createNativeText`).
// flight-lint: allow(conform-params) D23 (B): authored node and data fields are assigned after create (Principal c0f9227c); the constructor takes no authored options
pub fn create_native_text() -> Ref<NativeText> {
    let mut out: NativeText = create_node2d(
        NATIVE_TEXT_KIND.to_string(),
        Some(create_native_text_node2d_runtime),
    );
    initialize_native_text(&mut out);
    return flight_scene2d::publish_node2d(out);
}

// flight-lint: allow(conform-params) D23 (B) zero-field constructor (Principal 3139d09f); callers assign authored fields after create
pub fn create_native_text_data() -> NativeTextData {
    let mut out: NativeTextData = allocate_entity();
    initialize_native_text_data(&mut out);
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

/// Initializes the NativeText-owned construction tiers after the Node2D base is allocated.
// flight-lint: allow(conform-extra, conform-params) D23 (I): the public construction initializer of the source createNativeText
pub fn initialize_native_text(out: &mut NativeText) {
    out.data = create_native_text_data();
    out.native_text_runtime = Arc::new(RwLock::new(create_native_text_runtime()));
}

// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f); callers assign authored fields after create
pub fn initialize_native_text_data(out: &mut NativeTextData) {
    out.auto_size = TextAutoSize::None;
    out.height = 100.0;
    out.style = Arc::new(RwLock::new(NativeTextStyle::default()));
    out.text = String::new();
    out.vertical_align = TextVerticalAlign::Top;
    out.width = 100.0;
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
