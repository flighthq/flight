// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state and opaque host surfaces
//! The TextLabel renderer (TS `wgpuTextLabel.ts`): the label lays out through the text layout,
//! rasterizes its glyph runs into a per-node 2D surface at device-pixel density, and draws the
//! surface's image as one quad through the shared batch.

use std::sync::{Arc, RwLock};

use flight_color::compute_rgba_css_string;
use flight_entity::allocate_entity;
use flight_node::{NodeRef, RendererDataRef, get_node_local_content_revision};
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, RenderState, create_canvas_host_surface,
    destroy_canvas_host_surface,
};
use flight_render_wgpu::{
    WgpuRenderState, bind_wgpu_image_resource_texture, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};
use flight_surface::CanvasSurface;
use flight_text::contract::{
    TextLabel, compute_text_format_font_string, get_text_label_runtime, get_text_layout_result,
};
use flight_textlayout::contract::{
    TextAutoSize, TextLayoutParams, TextVerticalAlign, compute_text_layout,
    create_text_format_range,
};

use crate::scene2d_wgpu_runtime::{ensure_scene2d_wgpu_runtime, invalidate_wgpu_surface_image};
use crate::types::*;
use crate::wgpu_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, ensure_wgpu_quad_batch_resources,
    get_wgpu_render_proxy_color_adjustment, pack_wgpu_quad_batch_material_instance,
    prepare_wgpu_quad_batch_write, record_wgpu_quad_batch_color_scale_bias,
    resolve_wgpu_render_proxy_material_renderer, write_wgpu_quad_batch_instance,
};
use crate::wgpu_renderer_data::get_wgpu_renderer_data_mut;
use crate::wgpu_shape_data::{create_wgpu_surface_image, destroy_wgpu_premultiplied_image_texture};

/// The TextLabel renderer (TS `wgpuTextLabelRenderer`).
pub static WGPU_TEXT_LABEL_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_wgpu_text_label_data,
    destroy_data: Some(destroy_wgpu_text_label_data),
    is_dirty: None,
    submit: draw_wgpu_text_label,
};

// The label's renderer data: nothing is allocated until it first draws.
fn create_wgpu_text_label_data(
    _state: &mut WgpuRenderState,
    _source: &NodeRef,
) -> Option<RendererDataRef> {
    let mut out: WgpuTextLabelData = allocate_entity();
    out.alloc_h = 0.0;
    out.alloc_w = 0.0;
    out.image = None;
    out.last_content_id = -1;
    out.last_pixel_ratio = 0.0;
    out.log_h = 0.0;
    out.log_w = 0.0;
    out.surface = None;
    return Some(Arc::new(RwLock::new(out)));
}

// Removes the GPU cache entry while its image key is still valid, then returns the raster surface
// to the provider that created it.
fn destroy_wgpu_text_label_data(state: &mut WgpuRenderState, data: RendererDataRef) {
    let mut guard = data.write().unwrap();
    let Some(text_label_data) = get_wgpu_renderer_data_mut::<WgpuTextLabelData>(Some(&mut *guard))
    else {
        return;
    };
    if let Some(image) = &text_label_data.image {
        destroy_wgpu_premultiplied_image_texture(state, image);
    }
    if let Some(surface) = &text_label_data.surface {
        destroy_canvas_host_surface(
            &mut ensure_scene2d_wgpu_runtime(state).canvas_host_surfaces,
            surface,
        );
    }
}

/// Draws a TextLabel (TS `drawWgpuTextLabel`): re-lays-out and re-rasterizes only when the label's
/// content or the state's pixel ratio changed, then writes one quad of the label's logical size.
pub fn draw_wgpu_text_label(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let source_ref = render_proxy.source.clone();
    let source = source_ref.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<TextLabel>() else {
        return;
    };
    let text = source.data.text.clone();
    let text_format = source.data.text_format.clone();
    let field_width = source.data.width;
    let field_height = source.data.height;
    if text.is_empty() {
        return;
    }
    let Some(renderer_data) = render_proxy.renderer_data.clone() else {
        return;
    };

    let Some(material_renderer) = resolve_wgpu_render_proxy_material_renderer(state, render_proxy)
    else {
        return;
    };

    if state.canvas_host.is_none() || state.image_host.is_none() {
        return;
    }
    let mut guard = renderer_data.write().unwrap();
    let Some(text_data) = get_wgpu_renderer_data_mut::<WgpuTextLabelData>(Some(&mut *guard)) else {
        return;
    };
    let surface = match text_data.surface.clone() {
        Some(surface) => Some(surface),
        None => ensure_wgpu_text_label_surface(state, text_data, 1.0, 1.0),
    };
    let Some(mut surface) = surface else {
        return;
    };
    let max_tex_dim = get_wgpu_render_state_native_device(state)
        .device
        .limits()
        .max_texture_dimension_2d as f32;
    let pixel_ratio = state.render_state().pixel_ratio;
    let version = get_node_local_content_revision(source) as i64;

    if version != text_data.last_content_id || pixel_ratio != text_data.last_pixel_ratio {
        let measure_context = surface.read().unwrap().context.clone().handle.clone();
        let label_runtime = get_text_label_runtime(source);
        let result = get_text_layout_result(&mut label_runtime.write().unwrap());
        let mut result = result.write().unwrap();
        compute_text_layout(
            &mut result,
            &TextLayoutParams {
                auto_size: None,
                border: None,
                direction: None,
                format_ranges: vec![create_text_format_range(
                    text_format.clone(),
                    0,
                    utf16_length(&text),
                )],
                height: field_height,
                justification: None,
                max_lines: None,
                measure: Arc::new(move |value, format| {
                    measure_context.set_font(&compute_text_format_font_string(format));
                    return measure_context.measure_text(value).width;
                }),
                multiline: None,
                text: text.clone(),
                truncation_character: None,
                vertical_align: Some(if source.data.auto_size == TextAutoSize::None {
                    source.data.vertical_align
                } else {
                    TextVerticalAlign::Top
                }),
                width: field_width,
                word_wrap: None,
            },
        );

        text_data.last_content_id = version;
        text_data.last_pixel_ratio = pixel_ratio;
        text_data.log_w = 0.0;
        text_data.log_h = 0.0;

        if result.groups.is_empty() {
            return;
        }

        let mut max_x: f32 = 0.0;
        let mut max_y: f32 = 0.0;
        for group in &result.groups {
            let right = group.offset_x + group.width;
            let bottom = group.offset_y + group.ascent + group.descent;
            if right > max_x {
                max_x = right;
            }
            if bottom > max_y {
                max_y = bottom;
            }
        }

        let max_logical = (max_tex_dim / pixel_ratio).floor();
        let w = max_x.ceil().min(max_logical);
        let h = max_y.ceil().min(max_logical);
        if w <= 0.0 || h <= 0.0 {
            return;
        }

        let pw = (w * pixel_ratio).ceil();
        let ph = (h * pixel_ratio).ceil();
        let Some(resized) = ensure_wgpu_text_label_surface(state, text_data, pw, ph) else {
            return;
        };
        surface = resized;

        let ctx = surface.read().unwrap().context.clone().handle.clone();
        ctx.set_transform(pixel_ratio, 0.0, 0.0, pixel_ratio, 0.0, 0.0);
        ctx.clear_rect(0.0, 0.0, w, h);
        ctx.set_text_baseline("alphabetic");
        ctx.set_text_align("start");

        for group in &result.groups {
            let format = group.format.read().unwrap();
            ctx.set_font(&compute_text_format_font_string(&format));
            ctx.set_fill_style(&compute_rgba_css_string(format.color.unwrap_or(0x000000ff)));
            let slice = utf16_substring(&text, group.start_index, group.end_index);
            ctx.fill_text(
                &slice,
                group.offset_x,
                group.offset_y + group.ascent * 0.815,
            );
        }

        if let Some(image) = &text_data.image {
            invalidate_wgpu_surface_image(state, image);
        }

        text_data.log_w = w;
        text_data.log_h = h;
    }

    if text_data.log_w <= 0.0 || text_data.log_h <= 0.0 {
        return;
    }

    ensure_wgpu_quad_batch_resources(state);

    let Some(image) = text_data.image.clone() else {
        return;
    };
    let (log_w, log_h) = (text_data.log_w, text_data.log_h);
    drop(guard);
    let Some(texture_entry) = bind_wgpu_image_resource_texture(
        state,
        &image.read().unwrap(),
        Some(false),
        Some(true),
        None,
    ) else {
        return;
    };
    let start_instance = prepare_wgpu_quad_batch_write(
        state,
        &texture_entry,
        None,
        render_proxy.blend_mode.as_ref(),
        render_proxy.material.as_ref(),
        &material_renderer,
        1,
        None,
    );
    let base = start_instance as usize * QUAD_BATCH_INSTANCE_FLOATS;
    write_wgpu_quad_batch_instance(
        &mut get_wgpu_render_state_runtime_mut(state).quad_batch_writer_instance_data,
        base,
        &render_proxy.transform_2d,
        log_w,
        log_h,
        0.0,
        0.0,
        1.0,
        1.0,
        render_proxy.alpha,
    );
    pack_wgpu_quad_batch_material_instance(
        state,
        render_proxy.material_data.as_ref(),
        start_instance,
    );
    record_wgpu_quad_batch_color_scale_bias(
        state,
        get_wgpu_render_proxy_color_adjustment(render_proxy).as_ref(),
        start_instance,
    );
    get_wgpu_render_state_runtime_mut(state).quad_batch_writer_count += 1;
}

// Returns a surface at the requested pixel size, creating or resizing it via destroy + recreate.
// The paired image stays in sync with the surface lifecycle.
fn ensure_wgpu_text_label_surface(
    state: &mut WgpuRenderState,
    data: &mut WgpuTextLabelData,
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

// TS `text.length`: the UTF-16 length the layout indexes in.
pub(crate) fn utf16_length(text: &str) -> usize {
    return text.encode_utf16().count();
}

// TS `text.substring(start, end)` over UTF-16 code units.
pub(crate) fn utf16_substring(text: &str, start: usize, end: usize) -> String {
    let units: Vec<u16> = text.encode_utf16().collect();
    let end = end.min(units.len());
    let start = start.min(end);
    return String::from_utf16_lossy(&units[start..end]);
}
