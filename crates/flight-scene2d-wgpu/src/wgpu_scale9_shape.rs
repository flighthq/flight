// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state and opaque host surfaces
//! The nine-slice shape renderer (TS `wgpuScale9Shape.ts`): remapped shape commands rasterize into
//! a per-node 2D surface at the scaled size; the surface's image uploads through the shared texture
//! cache and draws as one quad with the scale stripped from the transform (the size is already
//! baked into the texture). Mirrors the GL Scale9 renderer.

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{create_matrix, create_rectangle};
use flight_image::{HostImageCapability, invalidate_image_resource};
use flight_node::{
    NodeRef, RendererData, RendererDataRef, get_node_local_bounds_rectangle,
    get_node_local_content_revision,
};
use flight_render::{
    CanvasHostSurfaces, NodeRenderer, RenderProxy2D, RenderRegistryTable, RenderState,
    create_canvas_host_surface, destroy_canvas_host_surface, emit_render_registry_miss,
};
use flight_render_wgpu::{
    WgpuRenderState, bind_wgpu_image_resource_texture, draw_wgpu_quad_with_transform,
    get_wgpu_render_proxy_color_scale_bias, get_wgpu_render_state_runtime,
};
use flight_shape::contract::SCALE9_SHAPE_KIND;
use flight_shape::{Scale9Shape, ShapeCommandToken, map_scale9_shape_commands};
use flight_surface::{CanvasSurface, HostCanvasCapability};

use crate::scene2d_wgpu_runtime::{ensure_scene2d_wgpu_runtime, narrow_canvas_2d_context};
use crate::types::*;
use crate::wgpu_quad_batch_writer::flush_wgpu_quad_batch_writer;
use crate::wgpu_scale9_mapper::build_wgpu_scale9_mapper;
use crate::wgpu_shape::draw_wgpu_shape;
use crate::wgpu_shape_data::{create_wgpu_surface_image, destroy_wgpu_premultiplied_image_texture};
use crate::wgpu_shape_rasterizer::get_wgpu_shape_rasterizer;

/// The nine-slice shape renderer (TS `wgpuScale9ShapeRenderer`).
pub static WGPU_SCALE9_SHAPE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: None,
    create_data: create_wgpu_scale9_shape_data,
    destroy_data: Some(destroy_wgpu_scale9_shape_data),
    is_dirty: None,
    submit: draw_wgpu_scale9_shape,
};

/// Allocates a Scale9Shape node's scratch (TS `createWgpuScale9ShapeData`).
pub fn create_wgpu_scale9_shape_data(
    _state: &mut WgpuRenderState,
    _source: &NodeRef,
) -> Option<RendererDataRef> {
    let mut out: WgpuScale9ShapeData = allocate_entity();
    out.image = None;
    out.last_h = 0.0;
    out.last_scale_x = -1.0;
    out.last_scale_y = -1.0;
    out.last_content_id = -1;
    out.last_pixel_ratio = 0.0;
    out.last_w = 0.0;
    out.surface = None;
    return Some(Arc::new(RwLock::new(out)));
}

/// Allocates the rasterization surface on first use (TS `acquireWgpuScale9ShapeRasterSurface`).
// flight-lint: allow(conform-params) D5 caller-owned ownership table replaces the TS module WeakMap
pub fn acquire_wgpu_scale9_shape_raster_surface(
    surfaces: &mut CanvasHostSurfaces,
    canvas_host: &HostCanvasCapability,
    image_host: &HostImageCapability,
    data: &mut WgpuScale9ShapeData,
) -> Option<Ref<CanvasSurface>> {
    if let Some(existing) = &data.surface {
        return Some(existing.clone());
    }
    let surface = create_canvas_host_surface(surfaces, canvas_host, 1.0, 1.0)?;
    data.surface = Some(surface.clone());
    data.image = create_wgpu_surface_image(image_host, &surface);
    return Some(surface);
}

/// Frees a Scale9Shape node's scratch (TS `destroyWgpuScale9ShapeData`): the GPU cache entry, then
/// the raster surface.
pub fn destroy_wgpu_scale9_shape_data(state: &mut WgpuRenderState, data: RendererDataRef) {
    let mut guard = data.write().unwrap();
    let Some(shape_data) = get_wgpu_scale9_shape_data(&mut *guard) else {
        return;
    };
    if let Some(image) = &shape_data.image {
        destroy_wgpu_premultiplied_image_texture(state, image);
    }
    if let Some(surface) = &shape_data.surface {
        destroy_canvas_host_surface(
            &mut ensure_scene2d_wgpu_runtime(state).canvas_host_surfaces,
            surface,
        );
    }
}

/// Draws a nine-slice shape (TS `drawWgpuScale9Shape`). A fill with no tessellated form is the
/// registered rasterizer's job; an absent one is reported rather than quietly dropping the fill.
pub fn draw_wgpu_scale9_shape(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    flush_wgpu_quad_batch_writer(state);

    let (commands, scale9_grid, version, scale_x, scale_y) = {
        let source = render_proxy.source.read().unwrap();
        let Some(shape) = source.as_any().downcast_ref::<Scale9Shape>() else {
            return;
        };
        let grid = shape.data.scale9_grid;
        (
            shape.data.commands.clone(),
            create_rectangle(grid.x, grid.y, grid.width, grid.height),
            get_node_local_content_revision(&*source) as i64,
            shape.scale_x,
            shape.scale_y,
        )
    };
    if commands.is_empty() {
        return;
    }
    let Some(renderer_data) = render_proxy.renderer_data.clone() else {
        return;
    };

    let Some(rasterizer) = get_wgpu_shape_rasterizer(state) else {
        emit_render_registry_miss(
            state,
            RenderRegistryTable::ShapeRasterizer,
            SCALE9_SHAPE_KIND.to_string(),
        );
        return;
    };

    let bounds = get_node_local_bounds_rectangle(&render_proxy.source);
    let Some(mapper) = build_wgpu_scale9_mapper(&bounds, &scale9_grid, scale_x, scale_y) else {
        draw_wgpu_shape(state, render_proxy);
        return;
    };

    let mut guard = renderer_data.write().unwrap();
    let pixel_ratio = state.render_state().pixel_ratio;
    let Some(shape_data) = get_wgpu_scale9_shape_data(&mut *guard) else {
        return;
    };
    let w = (bounds.width * scale_x).ceil();
    let h = (bounds.height * scale_y).ceil();
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let (Some(canvas_host), Some(image_host)) =
        (state.canvas_host.clone(), state.image_host.clone())
    else {
        return;
    };
    let Some(mut surface) = acquire_wgpu_scale9_shape_raster_surface(
        &mut ensure_scene2d_wgpu_runtime(state).canvas_host_surfaces,
        &canvas_host,
        &image_host,
        shape_data,
    ) else {
        return;
    };

    if version != shape_data.last_content_id
        || w != shape_data.last_w
        || h != shape_data.last_h
        || scale_x != shape_data.last_scale_x
        || scale_y != shape_data.last_scale_y
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
                destroy_wgpu_premultiplied_image_texture(state, image);
            }
            let surfaces = &mut ensure_scene2d_wgpu_runtime(state).canvas_host_surfaces;
            destroy_canvas_host_surface(surfaces, &surface);
            let Some(new_surface) = create_canvas_host_surface(surfaces, &canvas_host, pw, ph)
            else {
                shape_data.surface = None;
                shape_data.image = None;
                return;
            };
            shape_data.surface = Some(new_surface.clone());
            shape_data.image = create_wgpu_surface_image(&image_host, &new_surface);
            surface = new_surface;
        }
        let context_handle = surface.read().unwrap().context.clone();
        let context = narrow_canvas_2d_context(&context_handle);
        context.set_transform(
            pixel_ratio,
            0.0,
            0.0,
            pixel_ratio,
            -bounds.x * pixel_ratio,
            -bounds.y * pixel_ratio,
        );
        context.clear_rect(bounds.x, bounds.y, w, h);
        let mut remapped_commands: Vec<ShapeCommandToken> = Vec::new();
        map_scale9_shape_commands(&mut remapped_commands, &commands, &mapper);
        rasterizer(&context_handle, &remapped_commands, state);
        context.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        if let Some(image) = &shape_data.image {
            invalidate_image_resource(
                image,
                &ensure_scene2d_wgpu_runtime(state).image_resolver_state,
            );
        }

        shape_data.last_h = h;
        shape_data.last_scale_x = scale_x;
        shape_data.last_scale_y = scale_y;
        shape_data.last_content_id = version;
        shape_data.last_pixel_ratio = pixel_ratio;
        shape_data.last_w = w;
    }

    let Some(image) = shape_data.image.clone() else {
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

    // Strip the node scale from the transform: the texture is already rasterized at the scaled
    // size, so the quad draws at unit scale (only the non-scale parts of the transform apply).
    let t = &render_proxy.transform_2d;
    let a = if scale_x != 0.0 { t.a / scale_x } else { t.a };
    let b = if scale_x != 0.0 { t.b / scale_x } else { t.b };
    let c = if scale_y != 0.0 { t.c / scale_y } else { t.c };
    let d = if scale_y != 0.0 { t.d / scale_y } else { t.d };
    let color_scale_bias = get_wgpu_render_proxy_color_scale_bias(render_proxy);
    draw_wgpu_quad_with_transform(
        state,
        render_proxy.alpha,
        color_scale_bias.as_ref(),
        &create_matrix(a, b, c, d, t.tx, t.ty),
        &entry,
        0.0,
        0.0,
        w,
        h,
        0.0,
        0.0,
        1.0,
        1.0,
    );
}

/// Draws a nine-slice shape used as a mask (TS `drawWgpuScale9ShapeMask`).
pub fn draw_wgpu_scale9_shape_mask(
    state: &mut WgpuRenderState,
    data: &RenderProxy2D<WgpuRenderState>,
) {
    draw_wgpu_scale9_shape(state, data);
}

/// Narrows renderer data to the nine-slice shape scratch (TS `getWgpuScale9ShapeData`).
pub fn get_wgpu_scale9_shape_data(data: &mut dyn RendererData) -> Option<&mut WgpuScale9ShapeData> {
    return data.as_any_mut().downcast_mut::<WgpuScale9ShapeData>();
}
