// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use std::sync::{Arc, RwLock};

use flight_color::compute_rgba_css_string;
use flight_entity::{Ref, allocate_entity};
use flight_geometry::create_matrix;
use flight_image::{create_image_resolver_state, invalidate_image_resource};
use flight_node::{NodeRef, RendererData, RendererDataRef, get_node_local_content_revision};
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, create_canvas_host_surface,
    destroy_canvas_host_surface,
};
use flight_render_gl::{GlRenderState, bind_gl_image_resource_texture};
use flight_surface::{CanvasSurface, SurfaceRef};
use flight_text::contract::{
    TextLabel, compute_text_format_font_string, get_text_label_runtime, get_text_layout_result,
};
use flight_textformat::TextFormat;
use flight_textlayout::contract::{
    TextAutoSize, TextLayoutParams, TextMeasureFunction, TextVerticalAlign, compute_text_layout,
    create_text_format_range,
};
use flight_texture::TextureColorSpace;

use crate::gl_color_adjustment_material_feature::get_gl_render_proxy_color_adjustment;
use crate::gl_quad_batch_common::{
    current_gl_straight_alpha, pack_gl_proxy_material_instance, resolve_gl_proxy_material_renderer,
};
use crate::gl_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, ensure_gl_quad_batch_shader, prepare_gl_quad_batch_write,
    record_gl_quad_batch_color_scale_bias, write_gl_quad_batch_instance,
};
use crate::gl_shape_data::delete_gl_premultiplied_image_texture;
use crate::scene2d_gl_runtime::narrow_canvas_2d_context;
use crate::types::GlTextLabelData;

pub static GL_TEXT_LABEL_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_gl_text_label_data,
    destroy_data: Some(destroy_gl_text_label_data),
    is_dirty: None,
    submit: draw_gl_text_label,
};

fn create_gl_text_label_data(
    _state: &mut GlRenderState,
    _source: &NodeRef,
) -> Option<RendererDataRef> {
    let mut out: GlTextLabelData = allocate_entity();
    initialize_gl_text_label_data(&mut out);
    return Some(Arc::new(RwLock::new(out)));
}

pub fn initialize_gl_text_label_data(out: &mut GlTextLabelData) {
    out.alloc_h = 0.0;
    out.alloc_w = 0.0;
    out.image = None;
    out.last_content_id = -1;
    out.last_pixel_ratio = 0.0;
    out.log_h = 0.0;
    out.log_w = 0.0;
    out.surface = None;
}

// Remove the GPU cache entry while its Image key is still valid, then return the raster allocation
// to the host that created it. A node that never rasterized owns neither resource.
fn destroy_gl_text_label_data(state: &mut GlRenderState, data: RendererDataRef) {
    let mut guard = data.write().unwrap();
    let Some(text_data) = get_gl_text_label_data(&mut *guard) else {
        return;
    };
    let Some(surface) = &text_data.surface else {
        return;
    };
    if let Some(image) = &text_data.image {
        delete_gl_premultiplied_image_texture(state, image);
    }
    destroy_canvas_host_surface(
        &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
        surface,
    );
}

pub fn draw_gl_text_label(state: &mut GlRenderState, render_proxy: &RenderProxy2D<GlRenderState>) {
    let source_guard = render_proxy.source.read().unwrap();
    let Some(source) = source_guard.as_any().downcast_ref::<TextLabel>() else {
        return;
    };
    let data = &source.data;
    let text = data.text.clone();
    let (field_width, field_height) = (data.width, data.height);
    if text.is_empty() {
        return;
    }
    let Some(renderer_data) = &render_proxy.renderer_data else {
        return;
    };

    let Some(material_renderer) = resolve_gl_proxy_material_renderer(state, render_proxy) else {
        return;
    };

    if state.canvas_host.is_none() || state.image_host.is_none() {
        return;
    }
    let mut guard = renderer_data.write().unwrap();
    let Some(text_data) = get_gl_text_label_data(&mut *guard) else {
        return;
    };
    let mut surface = match text_data.surface.clone() {
        Some(surface) => Some(surface),
        None => ensure_gl_text_label_surface(state, text_data, 1.0, 1.0),
    };
    if surface.is_none() {
        return;
    }
    let pixel_ratio = state.render.pixel_ratio;
    let version = i64::from(get_node_local_content_revision(source));

    if version != text_data.last_content_id || pixel_ratio != text_data.last_pixel_ratio {
        let context = narrow_canvas_2d_context(&surface.as_ref().unwrap().read().unwrap().context);
        let measure_context = Arc::clone(&context);
        let measure: TextMeasureFunction = Arc::new(move |value: &str, format: &TextFormat| {
            measure_context.set_font(&compute_text_format_font_string(format));
            return measure_context.measure_text(value);
        });

        let result = {
            let runtime = get_text_label_runtime(source);
            let mut runtime = runtime.write().unwrap();
            get_text_layout_result(&mut runtime)
        };
        let utf16_length = text.encode_utf16().count();
        compute_text_layout(
            &mut result.write().unwrap(),
            &TextLayoutParams {
                auto_size: None,
                border: None,
                direction: None,
                format_ranges: vec![create_text_format_range(
                    data.text_format.clone(),
                    0,
                    utf16_length,
                )],
                height: field_height,
                justification: None,
                max_lines: None,
                measure,
                multiline: None,
                text: text.clone(),
                truncation_character: None,
                vertical_align: Some(if data.auto_size == TextAutoSize::None {
                    data.vertical_align
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

        let result = result.read().unwrap();
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
        let w = max_x.ceil();
        let h = max_y.ceil();
        if w <= 0.0 || h <= 0.0 {
            return;
        }

        let pw = (w * pixel_ratio).ceil();
        let ph = (h * pixel_ratio).ceil();
        surface = ensure_gl_text_label_surface(state, text_data, pw, ph);
        let Some(current) = &surface else {
            return;
        };

        let context = narrow_canvas_2d_context(&current.read().unwrap().context);
        context.set_transform(pixel_ratio, 0.0, 0.0, pixel_ratio, 0.0, 0.0);
        context.clear_rect(0.0, 0.0, w, h);
        context.set_text_baseline("alphabetic");
        context.set_text_align("start");

        let utf16 = text.encode_utf16().collect::<Vec<_>>();
        for group in &result.groups {
            let format = group.format.read().unwrap();
            context.set_font(&compute_text_format_font_string(&format));
            context.set_fill_style(&compute_rgba_css_string(format.color.unwrap_or(0x000000ff)));
            let end = group.end_index.min(utf16.len());
            let start = group.start_index.min(end);
            let slice = String::from_utf16_lossy(&utf16[start..end]);
            context.fill_text(
                &slice,
                group.offset_x,
                group.offset_y + group.ascent * 0.815,
            );
        }

        if let Some(image) = &text_data.image {
            invalidate_image_resource(image, &create_image_resolver_state());
        }
        text_data.log_w = w;
        text_data.log_h = h;
    }

    if text_data.log_w <= 0.0 || text_data.log_h <= 0.0 {
        return;
    }
    let (log_w, log_h) = (text_data.log_w, text_data.log_h);
    let image = text_data.image.clone();
    drop(guard);
    drop(source_guard);

    ensure_gl_quad_batch_shader(state);

    let Some(image) = image else {
        return;
    };
    let Ok(texture) = bind_gl_image_resource_texture(
        state,
        &image.read().unwrap(),
        None,
        None,
        true,
        TextureColorSpace::Linear,
    ) else {
        return;
    };
    let straight_alpha = current_gl_straight_alpha(state);
    let start_instance = prepare_gl_quad_batch_write(
        state,
        texture,
        straight_alpha,
        None,
        render_proxy.blend_mode.as_ref(),
        render_proxy.material.as_ref(),
        material_renderer,
        1,
        None,
    );
    let base = start_instance * QUAD_BATCH_INSTANCE_FLOATS;
    let t = &render_proxy.transform_2d;
    write_gl_quad_batch_instance(
        &mut state
            .gl_runtime
            .borrow_mut()
            .quad_batch_writer_instance_data,
        base,
        &create_matrix(t.a, t.b, t.c, t.d, t.tx, t.ty),
        log_w,
        log_h,
        0.0,
        0.0,
        1.0,
        1.0,
        render_proxy.alpha,
    );
    pack_gl_proxy_material_instance(state, render_proxy.material_data.as_ref(), start_instance);
    record_gl_quad_batch_color_scale_bias(
        state,
        get_gl_render_proxy_color_adjustment(render_proxy).as_ref(),
        start_instance,
    );
    state.gl_runtime.borrow_mut().quad_batch_writer_count += 1;
}

fn ensure_gl_text_label_surface(
    state: &GlRenderState,
    data: &mut GlTextLabelData,
    pw: f32,
    ph: f32,
) -> Option<Ref<CanvasSurface>> {
    if let Some(surface) = &data.surface
        && data.alloc_w == pw
        && data.alloc_h == ph
    {
        return Some(surface.clone());
    }
    if let Some(surface) = data.surface.take() {
        if let Some(image) = &data.image {
            delete_gl_premultiplied_image_texture(state, image);
        }
        destroy_canvas_host_surface(
            &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
            &surface,
        );
    }
    let (Some(canvas_host), Some(image_host)) = (&state.canvas_host, &state.image_host) else {
        data.surface = None;
        data.image = None;
        data.alloc_w = 0.0;
        data.alloc_h = 0.0;
        return None;
    };
    let surface = create_canvas_host_surface(
        &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
        canvas_host,
        pw,
        ph,
    );
    let Some(surface) = surface else {
        data.surface = None;
        data.image = None;
        data.alloc_w = 0.0;
        data.alloc_h = 0.0;
        return None;
    };
    data.surface = Some(surface.clone());
    let erased: SurfaceRef = surface.clone();
    data.image = image_host
        .create_image_from_surface
        .as_ref()
        .map(|create| create(&erased));
    data.alloc_w = pw;
    data.alloc_h = ph;
    return Some(surface);
}

fn get_gl_text_label_data(data: &mut dyn RendererData) -> Option<&mut GlTextLabelData> {
    return data.as_any_mut().downcast_mut::<GlTextLabelData>();
}
