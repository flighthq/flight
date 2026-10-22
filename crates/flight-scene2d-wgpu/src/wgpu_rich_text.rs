// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state and opaque host surfaces
//! The RichText renderer (TS `wgpuRichText.ts`): the field lays out, rasterizes its background,
//! border, glyph runs and decorations (plus an optional editable-input overlay) into a per-node 2D
//! surface, and draws the surface as one immediate quad.
//!
//! The raster surface belongs to the render node rather than the module: its image identity is the
//! GPU-cache key, so two RichText nodes drawn in one frame cannot overwrite each other's upload.

use std::sync::{Arc, RwLock};

use flight_color::compute_rgba_css_string;
use flight_entity::allocate_entity;
use flight_host::CanvasRenderingContext2D;
use flight_node::{NodeRef, RendererDataRef, downcast_node_ref};
use flight_render::{
    NodeRenderer, RenderProxy2D, RenderState, create_canvas_host_surface,
    destroy_canvas_host_surface,
};
use flight_render_wgpu::{
    WgpuRenderState, bind_wgpu_image_resource_texture, draw_wgpu_quad,
    get_wgpu_render_state_native_device, get_wgpu_render_state_runtime,
    resolve_wgpu_apply_blend_mode,
};
use flight_surface::CanvasSurface;
use flight_text::contract::{
    RichText, RichTextData, compute_rich_text_content, compute_text_format_font_string,
    get_rich_text_content, get_rich_text_password_character, get_rich_text_runtime,
    get_rich_text_scroll_y_offset, get_text_layout_result,
};
use flight_textlayout::contract::{
    TextAutoSize, TextBoundsSpec, TextFormatRange, TextLayoutParams, TextLayoutResult,
    TextVerticalAlign, compute_text_bounds_height, compute_text_bounds_offset_x,
    compute_text_bounds_width, compute_text_layout,
};

use crate::scene2d_wgpu_runtime::{
    ensure_scene2d_wgpu_runtime, get_scene2d_wgpu_runtime, invalidate_wgpu_surface_image,
};
use crate::types::*;
use crate::wgpu_quad_batch_writer::flush_wgpu_quad_batch_writer;
use crate::wgpu_renderer_data::get_wgpu_renderer_data_mut;
use crate::wgpu_shape_data::{create_wgpu_surface_image, destroy_wgpu_premultiplied_image_texture};
use crate::wgpu_text_label::utf16_substring;

/// The RichText renderer (TS `wgpuRichTextRenderer`).
pub static WGPU_RICH_TEXT_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: None,
    create_data: create_wgpu_rich_text_data,
    destroy_data: Some(destroy_wgpu_rich_text_data),
    is_dirty: None,
    submit: draw_wgpu_rich_text,
};

/// Allocates a RichText node's scratch (TS `createWgpuRichTextData`); a node that never rasterizes
/// owns no surface.
pub fn create_wgpu_rich_text_data(
    _state: &mut WgpuRenderState,
    _source: &NodeRef,
) -> Option<RendererDataRef> {
    let mut out: WgpuRichTextData = allocate_entity();
    out.alloc_h = 0.0;
    out.alloc_w = 0.0;
    out.image = None;
    out.surface = None;
    return Some(Arc::new(RwLock::new(out)));
}

/// Frees a RichText node's scratch (TS `destroyWgpuRichTextData`): the GPU cache entry while its
/// image key is still valid, then the raster surface back to the provider that created it.
pub fn destroy_wgpu_rich_text_data(state: &mut WgpuRenderState, data: RendererDataRef) {
    let mut guard = data.write().unwrap();
    let Some(rich_data) = get_wgpu_renderer_data_mut::<WgpuRichTextData>(Some(&mut *guard)) else {
        return;
    };
    if let Some(image) = &rich_data.image {
        destroy_wgpu_premultiplied_image_texture(state, image);
    }
    if let Some(surface) = &rich_data.surface {
        destroy_canvas_host_surface(
            &mut ensure_scene2d_wgpu_runtime(state).canvas_host_surfaces,
            surface,
        );
    }
}

fn draw_rich_text_to_canvas(
    context: &CanvasRenderingContext2D,
    source: &RichText,
    result: &TextLayoutResult,
    field_w: f32,
    field_h: f32,
    text: &str,
) {
    let data = &source.data;
    let first_visible_line = data.scroll_v - 1.0;
    let scroll_y_offset = if first_visible_line > 0.0 {
        get_rich_text_scroll_y_offset(&result.line_heights, first_visible_line as usize)
    } else {
        0.0
    };
    let scroll_x_offset = data.scroll_h;
    let context = context.handle.clone();

    context.save();
    context.begin_path();
    context.rect(0.0, 0.0, field_w, field_h);
    context.clip();
    context.set_text_baseline("alphabetic");
    context.set_text_align("start");

    for group in &result.groups {
        if (group.line_index as f32) < first_visible_line {
            continue;
        }

        let format = group.format.read().unwrap();
        context.set_font(&compute_text_format_font_string(&format));
        context.set_fill_style(&compute_rgba_css_string(
            format.color.unwrap_or(data.text_color),
        ));
        let slice = utf16_substring(text, group.start_index, group.end_index);
        let x = group.offset_x - scroll_x_offset;
        let y = group.offset_y + group.ascent - scroll_y_offset;
        context.fill_text(&slice, x, y);

        let underline = format.underline.unwrap_or(false);
        let strikethrough = format.strikethrough.unwrap_or(false);
        if underline || strikethrough {
            context.set_stroke_style(&compute_rgba_css_string(
                format.color.unwrap_or(data.text_color),
            ));
            context.set_line_width(1.0_f32.max(format.size.unwrap_or(12.0) / 16.0));
            if underline {
                let line_y = y + group.descent;
                context.begin_path();
                context.move_to(x, line_y);
                context.line_to(x + group.width, line_y);
                context.stroke();
            }
            // Strikethrough sits ~35% of the ascent above the baseline — through the middle of the
            // glyphs, matching the canvas rich text renderer.
            if strikethrough {
                let line_y = y - group.ascent * 0.35;
                context.begin_path();
                context.move_to(x, line_y);
                context.line_to(x + group.width, line_y);
                context.stroke();
            }
        }
    }

    context.restore();
}

/// Draws a RichText node (TS `drawWgpuRichText`), passing the editable-input overlay into the
/// rasterization only when the state's overlay slot is filled and the field has an input.
pub fn draw_wgpu_rich_text(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
    let has_input = render_proxy
        .source
        .read()
        .unwrap()
        .as_any()
        .downcast_ref::<RichText>()
        .is_some_and(|source| {
            get_rich_text_runtime(source)
                .read()
                .unwrap()
                .input
                .is_some()
        });
    let overlay = get_scene2d_wgpu_runtime(state)
        .and_then(|runtime| runtime.text_input_overlay)
        .filter(|_| has_input);
    draw_wgpu_rich_text_with_overlay(state, render_proxy, overlay);
}

/// Rasterizes and draws a RichText node with an optional overlay (TS
/// `drawWgpuRichTextWithOverlay`).
pub fn draw_wgpu_rich_text_with_overlay(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
    overlay: Option<WgpuRichTextOverlay>,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    flush_wgpu_quad_batch_writer(state);

    let Some(source_ref) = downcast_node_ref::<RichText>(&render_proxy.source) else {
        return;
    };
    let source_guard = source_ref.read().unwrap();
    let source = &*source_guard;
    let data = &source.data;
    let rich_text_runtime = get_rich_text_runtime(source);
    let content = get_rich_text_content(&mut rich_text_runtime.write().unwrap());
    let password_character = get_rich_text_password_character(source);
    compute_rich_text_content(
        &mut content.write().unwrap(),
        data,
        password_character.as_deref(),
    );
    let (content_text, content_ranges) = {
        let content = content.read().unwrap();
        (content.text.clone(), content.format_ranges.clone())
    };
    if content_text.is_empty() && !data.background && !data.border {
        return;
    }
    let Some(renderer_data) = render_proxy.renderer_data.clone() else {
        return;
    };
    let mut guard = renderer_data.write().unwrap();
    let Some(rich_data) = get_wgpu_renderer_data_mut::<WgpuRichTextData>(Some(&mut *guard)) else {
        return;
    };
    if state.canvas_host.is_none() || state.image_host.is_none() {
        return;
    }
    let surface = match rich_data.surface.clone() {
        Some(surface) => Some(surface),
        None => ensure_wgpu_rich_text_surface(state, rich_data, 1.0, 1.0),
    };
    let Some(surface) = surface else {
        return;
    };

    let label_runtime = rich_text_runtime.read().unwrap().text_label.clone();
    let result = get_text_layout_result(&mut label_runtime.write().unwrap());
    let mut result = result.write().unwrap();
    let measure_context = surface.read().unwrap().context.clone();
    layout_rich_text(
        &mut result,
        data,
        content_text.clone(),
        content_ranges,
        state,
        &measure_context,
    );
    let max_tex_dim = get_wgpu_render_state_native_device(state)
        .device
        .limits()
        .max_texture_dimension_2d as f32;
    let pixel_ratio = state.render_state().pixel_ratio;
    let max_logical = (max_tex_dim / pixel_ratio).floor();
    let spec = rich_text_bounds_spec(data);
    let field_w = compute_text_bounds_width(&spec, &result)
        .ceil()
        .min(max_logical);
    let field_h = compute_text_bounds_height(&spec, &result)
        .ceil()
        .min(max_logical);
    if field_w <= 0.0 || field_h <= 0.0 {
        return;
    }

    let pw = (field_w * pixel_ratio).ceil();
    let ph = (field_h * pixel_ratio).ceil();
    let Some(surface) = ensure_wgpu_rich_text_surface(state, rich_data, pw, ph) else {
        return;
    };
    let context_handle = surface.read().unwrap().context.clone();
    let off_ctx = context_handle.handle.clone();
    off_ctx.set_transform(pixel_ratio, 0.0, 0.0, pixel_ratio, 0.0, 0.0);
    off_ctx.clear_rect(0.0, 0.0, field_w, field_h);

    if data.background {
        off_ctx.set_fill_style(&compute_rgba_css_string(data.background_color));
        off_ctx.fill_rect(0.0, 0.0, field_w, field_h);
    }

    if data.border {
        off_ctx.set_stroke_style(&compute_rgba_css_string(data.border_color));
        off_ctx.set_line_width(1.0);
        off_ctx.stroke_rect(0.0, 0.0, field_w, field_h);
    }

    if !content_text.is_empty() {
        draw_rich_text_to_canvas(
            &context_handle,
            source,
            &result,
            field_w,
            field_h,
            &content_text,
        );
    }
    let spec_offset_x = compute_text_bounds_offset_x(&spec, &result);
    drop(source_guard);
    if let Some(overlay) = overlay {
        overlay(
            &context_handle,
            &source_ref,
            &result,
            field_w,
            field_h,
            &content_text,
        );
    }
    drop(result);
    if let Some(image) = &rich_data.image {
        invalidate_wgpu_surface_image(state, image);
    }

    if let Some(apply_blend_mode) = resolve_wgpu_apply_blend_mode(state) {
        apply_blend_mode(state, render_proxy.blend_mode.as_ref());
    }
    let Some(image) = rich_data.image.clone() else {
        return;
    };
    drop(guard);
    let Some(entry) = bind_wgpu_image_resource_texture(
        state,
        &image.read().unwrap(),
        Some(false),
        Some(true),
        None,
    ) else {
        return;
    };

    // Anchor the field box for autoSize right/center so the rendered quad lines up with the local
    // bounds (the rich text local bounds apply the same offset). Zero for none/left.
    let offset_x = spec_offset_x;
    draw_wgpu_quad(
        state,
        render_proxy,
        &entry,
        offset_x,
        0.0,
        offset_x + field_w,
        field_h,
        0.0,
        0.0,
        1.0,
        1.0,
    );
}

// Returns a surface at the requested pixel size, creating or resizing via destroy + recreate. The
// paired image stays in sync with the surface lifecycle.
fn ensure_wgpu_rich_text_surface(
    state: &mut WgpuRenderState,
    data: &mut WgpuRichTextData,
    pw: f32,
    ph: f32,
) -> Option<flight_entity::Ref<CanvasSurface>> {
    if let Some(surface) = &data.surface
        && data.alloc_w == pw
        && data.alloc_h == ph
    {
        return Some(surface.clone());
    }
    if let Some(surface) = data.surface.clone() {
        if let Some(image) = &data.image {
            destroy_wgpu_premultiplied_image_texture(state, image);
        }
        destroy_canvas_host_surface(
            &mut ensure_scene2d_wgpu_runtime(state).canvas_host_surfaces,
            &surface,
        );
    }
    let (Some(canvas_host), Some(image_host)) =
        (state.canvas_host.clone(), state.image_host.clone())
    else {
        data.surface = None;
        data.image = None;
        data.alloc_w = 0.0;
        data.alloc_h = 0.0;
        return None;
    };
    let Some(surface) = create_canvas_host_surface(
        &mut ensure_scene2d_wgpu_runtime(state).canvas_host_surfaces,
        &canvas_host,
        pw,
        ph,
    ) else {
        data.surface = None;
        data.image = None;
        data.alloc_w = 0.0;
        data.alloc_h = 0.0;
        return None;
    };
    data.surface = Some(surface.clone());
    data.image = create_wgpu_surface_image(&image_host, &surface);
    data.alloc_w = pw;
    data.alloc_h = ph;
    return Some(surface);
}

fn layout_rich_text(
    result: &mut TextLayoutResult,
    data: &RichTextData,
    text: String,
    format_ranges: Vec<TextFormatRange>,
    state: &WgpuRenderState,
    context: &CanvasRenderingContext2D,
) {
    let max_tex_dim = get_wgpu_render_state_native_device(state)
        .device
        .limits()
        .max_texture_dimension_2d as f32;
    let max_logical = (max_tex_dim / state.render_state().pixel_ratio).floor();
    let measure_context = context.handle.clone();

    compute_text_layout(
        result,
        &TextLayoutParams {
            auto_size: None,
            border: None,
            direction: None,
            format_ranges,
            height: data.height.min(max_logical),
            justification: None,
            max_lines: None,
            measure: Arc::new(move |value, format| {
                measure_context.set_font(&compute_text_format_font_string(format));
                return measure_context.measure_text(value).width;
            }),
            multiline: Some(data.multiline),
            text,
            truncation_character: None,
            vertical_align: Some(if data.auto_size == TextAutoSize::None {
                data.vertical_align
            } else {
                TextVerticalAlign::Top
            }),
            width: (if data.word_wrap { data.width } else { 10000.0 }).min(max_logical),
            word_wrap: Some(data.word_wrap),
        },
    );
}

/// Installs the editable-input overlay the RichText renderer rasterizes onto fields with an input
/// (TS `registerWgpuTextInputOverlay`).
// flight-lint: allow(conform-params) D5 the source's module-global overlay slot is the render state's own record
pub fn register_wgpu_text_input_overlay(state: &mut WgpuRenderState, overlay: WgpuRichTextOverlay) {
    ensure_scene2d_wgpu_runtime(state).text_input_overlay = Some(overlay);
}

// The bounds inputs of a rich text field (TS: the field data itself is the spec).
fn rich_text_bounds_spec(data: &RichTextData) -> TextBoundsSpec {
    return TextBoundsSpec {
        auto_size: data.auto_size,
        height: data.height,
        width: data.width,
        word_wrap: Some(data.word_wrap),
    };
}
