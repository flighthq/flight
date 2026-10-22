// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::create_rectangle;
use flight_image::{HostImageCapability, create_image_resolver_state, invalidate_image_resource};
use flight_node::{
    NodeRef, RendererData, RendererDataRef, get_node_local_bounds_rectangle,
    get_node_local_content_revision,
};
use flight_render::{
    CanvasHostSurfaces, NodeRenderer, RenderProxy2D, RenderRegistryTable,
    create_canvas_host_surface, destroy_canvas_host_surface, emit_render_registry_miss,
};
use flight_render_gl::{
    GlRenderState, GlShaderLocations, bind_gl_image_resource_texture, draw_gl_quad,
    set_gl_base_uniforms, set_gl_matrix_from_values, use_gl_program,
};
use flight_shape::Scale9Shape;
use flight_shape::contract::{SCALE9_SHAPE_KIND, map_scale9_shape_commands};
use flight_surface::{CanvasSurface, HostCanvasCapability, SurfaceRef};
use flight_texture::TextureColorSpace;

use crate::gl_quad_batch_writer::{flush_gl_quad_batch_writer, get_gl_viewport_size};
use crate::gl_scale9_mapper::build_gl_scale9_mapper;
use crate::gl_shape::draw_gl_shape;
use crate::gl_shape_data::delete_gl_premultiplied_image_texture;
use crate::gl_shape_rasterizer::get_gl_shape_rasterizer;
use crate::types::GlScale9ShapeData;

pub static GL_SCALE9_SHAPE_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: None,
    create_data: create_gl_scale9_shape_data,
    destroy_data: Some(destroy_gl_scale9_shape_data),
    is_dirty: None,
    submit: draw_gl_scale9_shape,
};

pub fn create_gl_scale9_shape_data(
    state: &mut GlRenderState,
    source: &NodeRef,
) -> Option<RendererDataRef> {
    let mut out: GlScale9ShapeData = allocate_entity();
    initialize_gl_scale9_shape_data(&mut out, state, source);
    return Some(Arc::new(RwLock::new(out)));
}

pub fn initialize_gl_scale9_shape_data(
    out: &mut GlScale9ShapeData,
    _state: &GlRenderState,
    _source: &NodeRef,
) {
    out.image = None;
    out.last_h = 0.0;
    out.last_scale_x = -1.0;
    out.last_scale_y = -1.0;
    out.last_content_id = -1;
    out.last_pixel_ratio = 0.0;
    out.last_w = 0.0;
    out.surface = None;
}

// flight-lint: allow(conform-params) D5 caller-owned ownership table replaces the TS module WeakMap
pub fn acquire_gl_scale9_shape_raster_surface(
    surfaces: &mut CanvasHostSurfaces,
    canvas_host: &HostCanvasCapability,
    image_host: &HostImageCapability,
    data: &mut GlScale9ShapeData,
) -> Option<Ref<CanvasSurface>> {
    if let Some(existing) = &data.surface {
        return Some(existing.clone());
    }
    let surface = create_canvas_host_surface(surfaces, canvas_host, 1.0, 1.0)?;
    data.surface = Some(surface.clone());
    let erased: SurfaceRef = surface.clone();
    data.image = image_host
        .create_image_from_surface
        .as_ref()
        .map(|create| create(&erased));
    return Some(surface);
}

// Remove the Image-keyed GPU entry before returning this per-node surface to the provider that
// created it.
pub fn destroy_gl_scale9_shape_data(state: &mut GlRenderState, data: RendererDataRef) {
    let mut guard = data.write().unwrap();
    let Some(shape_data) = get_gl_scale9_shape_data(&mut *guard) else {
        return;
    };
    if let Some(image) = &shape_data.image {
        delete_gl_premultiplied_image_texture(state, image);
    }
    if let Some(surface) = &shape_data.surface {
        destroy_canvas_host_surface(
            &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
            surface,
        );
    }
}

pub fn draw_gl_scale9_shape(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
) {
    flush_gl_quad_batch_writer(state);
    {
        let source = render_proxy.source.read().unwrap();
        let Some(shape) = source.as_any().downcast_ref::<Scale9Shape>() else {
            return;
        };
        if shape.data.commands.is_empty() {
            return;
        }
    }
    let Some(renderer_data) = &render_proxy.renderer_data else {
        return;
    };

    // A fill with no tessellated form is the registered rasterizer's job; an absent one is reported
    // rather than quietly dropping the fill.
    let Some(rasterizer) = get_gl_shape_rasterizer(state) else {
        emit_render_registry_miss(
            state,
            RenderRegistryTable::ShapeRasterizer,
            SCALE9_SHAPE_KIND.to_string(),
        );
        return;
    };

    let bounds = get_node_local_bounds_rectangle(&render_proxy.source);
    let source_guard = render_proxy.source.read().unwrap();
    let source = source_guard.as_any().downcast_ref::<Scale9Shape>().unwrap();
    let version = i64::from(get_node_local_content_revision(source));
    let grid = &source.data.scale9_grid;
    let Some(mapper) = build_gl_scale9_mapper(
        &bounds,
        &create_rectangle(grid.x, grid.y, grid.width, grid.height),
        source.scale_x,
        source.scale_y,
    ) else {
        drop(source_guard);
        draw_gl_shape(state, render_proxy);
        return;
    };

    let pixel_ratio = state.render.pixel_ratio;
    let w = (bounds.width * source.scale_x).ceil();
    let h = (bounds.height * source.scale_y).ceil();
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let (Some(canvas_host), Some(image_host)) =
        (state.canvas_host.clone(), state.image_host.clone())
    else {
        return;
    };
    let mut guard = renderer_data.write().unwrap();
    let Some(shape_data) = get_gl_scale9_shape_data(&mut *guard) else {
        return;
    };
    let Some(mut surface) = acquire_gl_scale9_shape_raster_surface(
        &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
        &canvas_host,
        &image_host,
        shape_data,
    ) else {
        return;
    };
    // Sized in device pixels with the replay pre-scaled to match. The quad below stays in local units
    // and samples the whole texture, so a denser raster is only sharper — no geometry moves with it.

    if version != shape_data.last_content_id
        || w != shape_data.last_w
        || h != shape_data.last_h
        || source.scale_x != shape_data.last_scale_x
        || source.scale_y != shape_data.last_scale_y
        || pixel_ratio != shape_data.last_pixel_ratio
    {
        let pw = (w * pixel_ratio).ceil();
        let ph = (h * pixel_ratio).ceil();
        let old_pw = if shape_data.last_w > 0.0 {
            (shape_data.last_w * shape_data.last_pixel_ratio).ceil()
        } else {
            0.0
        };
        let old_ph = if shape_data.last_h > 0.0 {
            (shape_data.last_h * shape_data.last_pixel_ratio).ceil()
        } else {
            0.0
        };
        if pw != old_pw || ph != old_ph {
            if let Some(image) = &shape_data.image {
                delete_gl_premultiplied_image_texture(state, image);
            }
            destroy_canvas_host_surface(
                &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
                &surface,
            );
            let new_surface = create_canvas_host_surface(
                &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
                &canvas_host,
                pw,
                ph,
            );
            let Some(new_surface) = new_surface else {
                shape_data.surface = None;
                shape_data.image = None;
                return;
            };
            shape_data.surface = Some(new_surface.clone());
            let erased: SurfaceRef = new_surface.clone();
            shape_data.image = image_host
                .create_image_from_surface
                .as_ref()
                .map(|create| create(&erased));
            surface = new_surface;
        }
        let context = surface.read().unwrap().context.clone();
        let canvas = context.handle.clone();
        canvas.set_transform(
            pixel_ratio,
            0.0,
            0.0,
            pixel_ratio,
            -bounds.x * pixel_ratio,
            -bounds.y * pixel_ratio,
        );
        canvas.clear_rect(bounds.x, bounds.y, w, h);
        let mut remapped_commands = Vec::new();
        map_scale9_shape_commands(&mut remapped_commands, &source.data.commands, &mapper);
        rasterizer(&context, &remapped_commands, state);
        canvas.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        if let Some(image) = &shape_data.image {
            invalidate_image_resource(image, &create_image_resolver_state());
        }
        shape_data.last_h = h;
        shape_data.last_scale_x = source.scale_x;
        shape_data.last_scale_y = source.scale_y;
        shape_data.last_content_id = version;
        shape_data.last_pixel_ratio = pixel_ratio;
        shape_data.last_w = w;
    }
    let image = shape_data.image.clone();
    let (scale_x, scale_y) = (source.scale_x, source.scale_y);
    drop(guard);
    drop(source_guard);

    let Ok(shader) = use_gl_program(state, None) else {
        return;
    };

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

    let locations = shader.locations.clone();
    set_gl_base_uniforms(&state.gl, &locations, render_proxy);

    let (viewport_width, viewport_height) = get_gl_viewport_size(state);
    let mut matrix_array = state.gl_runtime.borrow().matrix_array;
    set_stripped_gl_matrix_from_values(
        &state.gl,
        &locations,
        &mut matrix_array,
        &render_proxy.transform_2d,
        scale_x,
        scale_y,
        viewport_width,
        viewport_height,
    );
    state.gl_runtime.borrow_mut().matrix_array = matrix_array;

    let _ = draw_gl_quad(state, 0.0, 0.0, w, h, 0.0, 0.0, 1.0, 1.0);
}

pub fn draw_gl_scale9_shape_mask(state: &mut GlRenderState, data: &RenderProxy2D<GlRenderState>) {
    draw_gl_scale9_shape(state, data);
}

pub fn get_gl_scale9_shape_data(data: &mut dyn RendererData) -> Option<&mut GlScale9ShapeData> {
    return data.as_any_mut().downcast_mut::<GlScale9ShapeData>();
}

fn set_stripped_gl_matrix_from_values(
    gl: &glow::Context,
    loc: &GlShaderLocations,
    m: &mut [f32; 9],
    t: &flight_geometry::Matrix,
    scale_x: f32,
    scale_y: f32,
    viewport_width: f32,
    viewport_height: f32,
) {
    let a = if scale_x != 0.0 { t.a / scale_x } else { t.a };
    let b = if scale_x != 0.0 { t.b / scale_x } else { t.b };
    let c = if scale_y != 0.0 { t.c / scale_y } else { t.c };
    let d = if scale_y != 0.0 { t.d / scale_y } else { t.d };
    set_gl_matrix_from_values(
        gl,
        loc,
        m,
        a,
        b,
        c,
        d,
        t.tx,
        t.ty,
        viewport_width,
        viewport_height,
    );
}
