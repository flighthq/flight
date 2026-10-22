// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use std::sync::{Arc, RwLock};

use flight_color::compute_rgba_css_string;
use flight_entity::{Ref, allocate_entity};
use flight_image::{create_image_resolver_state, invalidate_image_resource};
use flight_node::{NodeRef, RendererDataRef};
use flight_render::{
    NodeRenderer, RenderProxy2D, create_canvas_host_surface, destroy_canvas_host_surface,
};
use flight_render_gl::{
    GlRenderState, bind_gl_image_resource_texture, draw_gl_quad, resolve_gl_shader, use_gl_program,
};
use flight_surface::{CanvasSurface, SurfaceRef};
use flight_text::contract::{
    RichText, RichTextRuntime, compute_rich_text_content, compute_text_format_font_string,
    get_rich_text_content, get_rich_text_password_character, get_rich_text_runtime,
    get_rich_text_scroll_y_offset, get_text_layout_result,
};
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textlayout::contract::{
    TextAutoSize, TextBoundsSpec, TextLayoutParams, TextLayoutResult, TextMeasureFunction,
    TextVerticalAlign, compute_text_bounds_height, compute_text_bounds_offset_x,
    compute_text_bounds_width, compute_text_layout,
};
use flight_texture::TextureColorSpace;

use crate::gl_quad_batch_writer::flush_gl_quad_batch_writer;
use crate::gl_shape_data::delete_gl_premultiplied_image_texture;
use crate::scene2d_gl_runtime::{downcast_gl_node_ref, ensure_scene2d_gl_runtime};
use crate::types::{GlRichTextData, GlRichTextOverlay, Scene2DGlRuntime};
use flight_host::Canvas2DContext;

pub static GL_RICH_TEXT_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: None,
    create_data: create_gl_rich_text_data,
    destroy_data: Some(destroy_gl_rich_text_data),
    is_dirty: None,
    submit: draw_gl_rich_text,
};

pub fn create_gl_rich_text_data(
    state: &mut GlRenderState,
    source: &NodeRef,
) -> Option<RendererDataRef> {
    let mut out: GlRichTextData = allocate_entity();
    initialize_gl_rich_text_data(&mut out, state, source);
    return Some(Arc::new(RwLock::new(out)));
}

pub fn initialize_gl_rich_text_data(
    out: &mut GlRichTextData,
    _state: &GlRenderState,
    _source: &NodeRef,
) {
    out.alloc_h = 0.0;
    out.alloc_w = 0.0;
    out.image = None;
    out.surface = None;
}

fn bounds_spec(source: &RichText) -> TextBoundsSpec {
    let data = &source.data;
    return TextBoundsSpec {
        auto_size: data.auto_size,
        height: data.height,
        width: data.width,
        word_wrap: Some(data.word_wrap),
    };
}

// Remove the GPU realization while its Image key is still valid, then return the raster allocation to
// the provider that created it. A node that never rasterized owns neither resource.
pub fn destroy_gl_rich_text_data(state: &mut GlRenderState, data: RendererDataRef) {
    let mut guard = data.write().unwrap();
    let Some(rich_data) = guard.as_any_mut().downcast_mut::<GlRichTextData>() else {
        return;
    };
    if let Some(image) = &rich_data.image {
        delete_gl_premultiplied_image_texture(state, image);
    }
    if let Some(surface) = &rich_data.surface {
        destroy_canvas_host_surface(
            &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
            surface,
        );
    }
}

pub fn draw_gl_rich_text(state: &mut GlRenderState, render_proxy: &RenderProxy2D<GlRenderState>) {
    // The editable-input overlay rasterizes onto the offscreen field texture, so it is passed into
    // the rasterization pass — only when the input slot is present. register_gl_text_input_overlay
    // (enable_gl_text_input) installs it; a static RichText leaves the slot empty.
    let installed = ensure_scene2d_gl_runtime(state).text_input_overlay;
    let has_input = {
        let source = render_proxy.source.read().unwrap();
        source
            .as_any()
            .downcast_ref::<RichText>()
            .is_some_and(|text| get_rich_text_runtime(text).read().unwrap().input.is_some())
    };
    let overlay = if has_input { installed } else { None };
    draw_gl_rich_text_with_overlay(state, render_proxy, overlay);
}

pub fn draw_gl_rich_text_with_overlay(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
    overlay: Option<GlRichTextOverlay>,
) {
    flush_gl_quad_batch_writer(state);
    let Some(source_ref) = downcast_gl_node_ref::<RichText>(&render_proxy.source) else {
        return;
    };
    let source = source_ref.read().unwrap();
    let data = &source.data;
    let rich_text_runtime = get_rich_text_runtime(&source);
    let content = get_rich_text_content(&mut rich_text_runtime.write().unwrap());
    compute_rich_text_content(
        &mut content.write().unwrap(),
        data,
        get_rich_text_password_character(&source).as_deref(),
    );
    let (content_text, content_ranges) = {
        let content = content.read().unwrap();
        (content.text.clone(), content.format_ranges.clone())
    };
    if content_text.is_empty() && !data.background && !data.border {
        return;
    }
    let Some(renderer_data) = &render_proxy.renderer_data else {
        return;
    };
    if state.canvas_host.is_none() || state.image_host.is_none() {
        return;
    }
    let mut guard = renderer_data.write().unwrap();
    let Some(rich_text_data) = guard.as_any_mut().downcast_mut::<GlRichTextData>() else {
        return;
    };
    let mut surface = match rich_text_data.surface.clone() {
        Some(surface) => Some(surface),
        None => ensure_gl_rich_text_surface(state, rich_text_data, 1.0, 1.0),
    };
    let Some(current) = &surface else {
        return;
    };

    let context = current.read().unwrap().context.clone();
    let result = layout_rich_text(
        &source,
        &rich_text_runtime.read().unwrap(),
        &content_text,
        content_ranges,
        &context.handle.clone(),
    );
    let result_guard = result.read().unwrap();
    let spec = bounds_spec(&source);
    let field_w = compute_text_bounds_width(&spec, &result_guard).ceil();
    let field_h = compute_text_bounds_height(&spec, &result_guard).ceil();
    if field_w <= 0.0 || field_h <= 0.0 {
        return;
    }

    let pixel_ratio = state.render.pixel_ratio;
    let pw = (field_w * pixel_ratio).ceil();
    let ph = (field_h * pixel_ratio).ceil();
    surface = ensure_gl_rich_text_surface(state, rich_text_data, pw, ph);
    let Some(current) = &surface else {
        return;
    };
    let context = current.read().unwrap().context.clone();
    let off_ctx = context.handle.clone();
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
            &*off_ctx,
            &source,
            &result_guard,
            field_w,
            field_h,
            &content_text,
        );
    }
    let offset_x = compute_text_bounds_offset_x(&spec, &result_guard);
    let image = rich_text_data.image.clone();
    drop(guard);
    drop(source);
    if let Some(overlay) = overlay {
        overlay(
            &context,
            &source_ref,
            &result_guard,
            field_w,
            field_h,
            &content_text,
        );
    }
    drop(result_guard);
    if let Some(image) = &image {
        invalidate_image_resource(image, &create_image_resolver_state());
    }

    let Ok(shader) = resolve_gl_shader(state, render_proxy) else {
        return;
    };
    if use_gl_program(state, Some(Arc::clone(&shader))).is_err() {
        return;
    }
    let Some(image) = image else {
        return;
    };
    if bind_gl_image_resource_texture(
        state,
        &image.read().unwrap(),
        None,
        None,
        true,
        TextureColorSpace::Linear,
    )
    .is_err()
    {
        return;
    }

    let gl = std::rc::Rc::clone(&state.gl);
    (shader.bind)(&gl, state, render_proxy);

    // Anchor the field box for autoSize right/center so the rendered quad lines up with the local
    // bounds. Zero for none/left.
    let _ = draw_gl_quad(
        state,
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

fn draw_rich_text_to_canvas(
    context: &dyn Canvas2DContext,
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

    context.save();
    context.begin_path();
    context.rect(0.0, 0.0, field_w, field_h);
    context.clip();
    context.set_text_baseline("alphabetic");
    context.set_text_align("start");

    let utf16 = text.encode_utf16().collect::<Vec<_>>();
    for group in &result.groups {
        if (group.line_index as f32) < first_visible_line {
            continue;
        }

        let format = group.format.read().unwrap();
        context.set_font(&compute_text_format_font_string(&format));
        let color = format.color.unwrap_or(data.text_color);
        context.set_fill_style(&compute_rgba_css_string(color));
        let end = group.end_index.min(utf16.len());
        let start = group.start_index.min(end);
        let slice = String::from_utf16_lossy(&utf16[start..end]);
        let x = group.offset_x - scroll_x_offset;
        let y = group.offset_y + group.ascent - scroll_y_offset;
        context.fill_text(&slice, x, y);

        let underline = format.underline.unwrap_or(false);
        let strikethrough = format.strikethrough.unwrap_or(false);
        if underline || strikethrough {
            context.set_stroke_style(&compute_rgba_css_string(color));
            context.set_line_width((format.size.unwrap_or(12.0) / 16.0).max(1.0));
            if underline {
                let line_y = y + group.descent;
                context.begin_path();
                context.move_to(x, line_y);
                context.line_to(x + group.width, line_y);
                context.stroke();
            }
            // Strikethrough sits ~35% of the ascent above the baseline — through the middle of the
            // glyphs.
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

// Returns a surface at the requested pixel dimensions, creating or resizing via destroy+recreate as
// needed. The paired image resource stays in sync with the surface lifecycle.
fn ensure_gl_rich_text_surface(
    state: &GlRenderState,
    data: &mut GlRichTextData,
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

fn layout_rich_text(
    source: &RichText,
    rich_text_runtime: &RichTextRuntime,
    text: &str,
    format_ranges: Vec<TextFormatRange>,
    context: &Arc<dyn Canvas2DContext>,
) -> Ref<TextLayoutResult> {
    let data = &source.data;
    let measure_context = Arc::clone(context);
    let measure: TextMeasureFunction = Arc::new(move |value: &str, format: &TextFormat| {
        measure_context.set_font(&compute_text_format_font_string(format));
        return measure_context.measure_text(value).width;
    });

    let result = get_text_layout_result(&mut rich_text_runtime.text_label.write().unwrap());
    compute_text_layout(
        &mut result.write().unwrap(),
        &TextLayoutParams {
            auto_size: None,
            border: None,
            direction: None,
            format_ranges,
            height: data.height,
            justification: None,
            max_lines: None,
            measure,
            multiline: Some(data.multiline),
            text: text.to_string(),
            truncation_character: None,
            vertical_align: Some(if data.auto_size == TextAutoSize::None {
                data.vertical_align
            } else {
                TextVerticalAlign::Top
            }),
            width: data.width,
            word_wrap: Some(data.word_wrap),
        },
    );
    return result;
}

// flight-lint: allow(conform-params) D5 the overlay registry is explicit per-state rather than a TS module global
pub fn register_gl_text_input_overlay(state: &GlRenderState, overlay: GlRichTextOverlay) {
    let mut runtime: std::cell::RefMut<'_, Scene2DGlRuntime> = ensure_scene2d_gl_runtime(state);
    runtime.text_input_overlay = Some(overlay);
}
