//! BitmapText construction, data mutation, bounds, pages and stale-layout queries.

use std::sync::Arc;

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Rectangle, copy_rectangle, create_rectangle};
use flight_glyphatlas::GlyphSource;
use flight_node::Node;
use flight_scene2d::{Node2DRuntime, Node2DRuntimeMethods, create_node2d, create_node2d_runtime};
use flight_textureatlas::create_texture_atlas;

use crate::types::*;
use crate::update_bitmap_text::call_glyph_source_get_layout_version;

const BITMAP_TEXT_TRANSFORM_STRIDE: usize = 2;

/// Allocates a BitmapText display node bound to one live glyph source (TS `createBitmapText`).
pub fn create_bitmap_text(
    glyph_source: Option<Ref<GlyphSource>>,
    options: Option<&BitmapTextOptions>,
) -> Ref<BitmapText> {
    let mut out: BitmapText = create_node2d(
        BITMAP_TEXT_KIND.to_string(),
        None,
        Some(create_bitmap_text_node2d_runtime),
    );
    out.data = create_bitmap_text_data(None);
    out.data.glyph_source = glyph_source;
    if let Some(options) = options {
        apply_bitmap_text_options(&mut out.data, options);
    }
    out.bitmap_text_runtime = create_bitmap_text_runtime();
    out.bitmap_text_runtime
        .pages
        .push(create_bitmap_text_page());
    return flight_scene2d::publish_node2d(out);
}

/// Allocates BitmapText kind data (TS `createBitmapTextData`).
pub fn create_bitmap_text_data(data: Option<&BitmapTextDataOptions>) -> BitmapTextData {
    let mut out: BitmapTextData = allocate_entity();
    initialize_bitmap_text_data(&mut out, data);
    return out;
}

fn create_bitmap_text_node2d_runtime() -> Node2DRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(copy_local_bounds_rectangle)),
        is_local_bounds_rectangle_valid: None,
    };
    return create_node2d_runtime(Some(&methods));
}

fn create_bitmap_text_page() -> BitmapTextPage {
    return BitmapTextPage {
        atlas: create_texture_atlas(None),
        ids: Vec::new().into_boxed_slice(),
        instance_count: 0,
        transforms: Vec::new().into_boxed_slice(),
    };
}

/// Allocates the BitmapText-specific runtime fields (TS `createBitmapTextRuntime`).
pub fn create_bitmap_text_runtime() -> BitmapTextRuntime {
    return BitmapTextRuntime::default();
}

/// Initializes BitmapText kind data from its optional partial record (TS
/// `initializeBitmapTextData`).
pub fn initialize_bitmap_text_data(out: &mut BitmapTextData, data: Option<&BitmapTextDataOptions>) {
    out.align = data
        .and_then(|data| data.align)
        .unwrap_or(BitmapTextAlign::Left);
    out.ellipsis = data
        .and_then(|data| data.ellipsis.clone())
        .unwrap_or_default();
    out.glyph_source = data.and_then(|data| data.glyph_source.clone());
    out.letter_spacing = data.and_then(|data| data.letter_spacing).unwrap_or(0.0);
    out.line_height = data.and_then(|data| data.line_height).unwrap_or(1.0);
    out.max_lines = data.and_then(|data| data.max_lines);
    out.text = data.and_then(|data| data.text.clone()).unwrap_or_default();
    out.wrap_width = data.and_then(|data| data.wrap_width);
}

fn apply_bitmap_text_options(data: &mut BitmapTextData, options: &BitmapTextOptions) {
    if let Some(align) = options.align {
        data.align = align;
    }
    if let Some(ellipsis) = &options.ellipsis {
        data.ellipsis = ellipsis.clone();
    }
    if let Some(letter_spacing) = options.letter_spacing {
        data.letter_spacing = letter_spacing;
    }
    if let Some(line_height) = options.line_height {
        data.line_height = line_height;
    }
    if let Some(max_lines) = options.max_lines {
        data.max_lines = max_lines;
    }
    if let Some(text) = &options.text {
        data.text = text.clone();
    }
    if let Some(wrap_width) = options.wrap_width {
        data.wrap_width = wrap_width;
    }
}

/// Writes the cached laid-out extent or a zero rectangle before first layout (TS
/// `computeBitmapTextLocalBoundsRectangle`).
pub fn compute_bitmap_text_local_bounds_rectangle(out: &mut Rectangle, source: &BitmapText) {
    let Some(bounds) = &source.bitmap_text_runtime.local_bounds_rectangle else {
        set_zero_rectangle(out);
        return;
    };
    let x = bounds.x;
    let y = bounds.y;
    let width = bounds.width;
    let height = bounds.height;
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
}

fn copy_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    let Some(source) = source.as_any().downcast_ref::<BitmapText>() else {
        return;
    };
    if let Some(bounds) = &source.bitmap_text_runtime.local_bounds_rectangle {
        copy_rectangle(out, bounds);
    }
}

/// Allocates a fresh Rectangle containing the current laid-out extent (TS `getBitmapTextBounds`).
pub fn get_bitmap_text_bounds(source: &BitmapText) -> Rectangle {
    let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
    compute_bitmap_text_local_bounds_rectangle(&mut out, source);
    return out;
}

/// Returns the last laid-out visible line count (TS `getBitmapTextLineCount`).
pub fn get_bitmap_text_line_count(source: &BitmapText) -> usize {
    return source.bitmap_text_runtime.line_count;
}

/// Returns the page-indexed retained glyph-quad pages (TS `getBitmapTextPages`).
pub fn get_bitmap_text_pages(source: &BitmapText) -> &[BitmapTextPage] {
    return &source.bitmap_text_runtime.pages;
}

/// Whether the bound source's placement version differs from the baked region version (TS
/// `isBitmapTextGlyphLayoutStale`).
pub fn is_bitmap_text_glyph_layout_stale(source: &BitmapText) -> bool {
    let Some(glyph_source) = &source.data.glyph_source else {
        return false;
    };
    return source.bitmap_text_runtime.glyph_layout_version
        != i64::from(call_glyph_source_get_layout_version(glyph_source));
}

/// Whether the last layout discarded trailing lines (TS `isBitmapTextTruncated`).
pub fn is_bitmap_text_truncated(source: &BitmapText) -> bool {
    return source.bitmap_text_runtime.truncated;
}

/// Grows every existing page's Uint16 id and stride-two Float32 transform buffers without changing
/// their logical instance counts (TS `reserveBitmapText`).
pub fn reserve_bitmap_text(target: &mut BitmapText, glyph_capacity: usize) {
    let mut page_index = 0;
    while page_index < target.bitmap_text_runtime.pages.len() {
        let page = &mut target.bitmap_text_runtime.pages[page_index];
        reserve_uint16_array(&mut page.ids, glyph_capacity);
        reserve_float32_array(
            &mut page.transforms,
            glyph_capacity * BITMAP_TEXT_TRANSFORM_STRIDE,
        );
        page_index += 1;
    }
}

fn reserve_float32_array(target: &mut Box<[f32]>, capacity: usize) {
    if target.len() >= capacity {
        return;
    }
    let mut next = vec![0.0; capacity];
    next[..target.len()].copy_from_slice(target);
    *target = next.into_boxed_slice();
}

fn reserve_uint16_array(target: &mut Box<[u16]>, capacity: usize) {
    if target.len() >= capacity {
        return;
    }
    let mut next = vec![0; capacity];
    next[..target.len()].copy_from_slice(target);
    *target = next.into_boxed_slice();
}

/// Mutates line alignment only; the caller explicitly updates layout (TS `setBitmapTextAlign`).
pub fn set_bitmap_text_align(target: &mut BitmapText, align: BitmapTextAlign) {
    target.data.align = align;
}

pub fn set_bitmap_text_ellipsis(target: &mut BitmapText, ellipsis: &str) {
    target.data.ellipsis = ellipsis.to_string();
}

pub fn set_bitmap_text_glyph_source(
    target: &mut BitmapText,
    glyph_source: Option<Ref<GlyphSource>>,
) {
    target.data.glyph_source = glyph_source;
}

pub fn set_bitmap_text_letter_spacing(target: &mut BitmapText, letter_spacing: f32) {
    target.data.letter_spacing = letter_spacing;
}

pub fn set_bitmap_text_line_height(target: &mut BitmapText, line_height: f32) {
    target.data.line_height = line_height;
}

pub fn set_bitmap_text_max_lines(target: &mut BitmapText, max_lines: Option<usize>) {
    target.data.max_lines = max_lines;
}

pub fn set_bitmap_text_text(target: &mut BitmapText, text: &str) {
    target.data.text = text.to_string();
}

pub fn set_bitmap_text_wrap_width(target: &mut BitmapText, wrap_width: Option<f32>) {
    target.data.wrap_width = wrap_width;
}

fn set_zero_rectangle(out: &mut Rectangle) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
}
