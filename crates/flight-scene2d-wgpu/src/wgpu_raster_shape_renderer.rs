// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state
//! The canvas-only shape strategy (TS `wgpuRasterShapeRenderer.ts`): the shape's whole command
//! stream replays into an offscreen 2D canvas through the registered rasterizer, and the result
//! draws as one textured quad. Mirrors scene2d-gl's raster shape renderer.

use flight_geometry::create_matrix;
use flight_image::invalidate_image_resource;
use flight_node::{get_node_local_bounds_rectangle, get_node_local_content_revision};
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, RenderRegistryTable, RenderState,
    create_canvas_host_surface, destroy_canvas_host_surface, emit_render_registry_miss,
};
use flight_render_wgpu::{
    WgpuRenderState, bind_wgpu_image_resource_texture, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut,
};
use flight_shape::contract::SHAPE_KIND;

use crate::scene2d_wgpu_runtime::{ensure_scene2d_wgpu_runtime, narrow_canvas_2d_context};
use crate::wgpu_mesh_shape_renderer::get_wgpu_shape_commands;
use crate::wgpu_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, ensure_wgpu_quad_batch_resources,
    get_wgpu_render_proxy_color_adjustment, pack_wgpu_quad_batch_material_instance,
    prepare_wgpu_quad_batch_write, record_wgpu_quad_batch_color_scale_bias,
    resolve_wgpu_render_proxy_material_renderer, write_wgpu_quad_batch_instance,
};
use crate::wgpu_shape_data::{
    acquire_wgpu_shape_raster_surface, create_wgpu_shape_data, create_wgpu_surface_image,
    destroy_wgpu_premultiplied_image_texture, destroy_wgpu_shape_data, get_wgpu_shape_data,
};
use crate::wgpu_shape_rasterizer::get_wgpu_shape_rasterizer;

/// The canvas-only shape strategy (TS `wgpuRasterShapeRenderer`): every shape rasterizes through
/// the registered rasterizer, so the full canvas command vocabulary must be registered.
pub static WGPU_RASTER_SHAPE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_wgpu_shape_data,
    destroy_data: Some(destroy_wgpu_shape_data),
    is_dirty: None,
    submit: draw_wgpu_raster_shape,
};

/// Replays the shape's whole command stream into an offscreen 2D canvas and draws the result as
/// one textured quad (TS `drawWgpuRasterShape`). The surface is sized in device pixels with the
/// replay pre-scaled to match; the quad stays in local units and samples the whole texture.
pub fn draw_wgpu_raster_shape(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let (commands, version) = {
        let source = render_proxy.source.read().unwrap();
        let Some(commands) = get_wgpu_shape_commands(&*source) else {
            return;
        };
        (
            commands.to_vec(),
            get_node_local_content_revision(&*source) as i64,
        )
    };
    if commands.is_empty() || render_proxy.renderer_data.is_none() {
        return;
    }

    let Some(rasterizer) = get_wgpu_shape_rasterizer(state) else {
        emit_render_registry_miss(
            state,
            RenderRegistryTable::ShapeRasterizer,
            SHAPE_KIND.to_string(),
        );
        return;
    };

    let Some(material_renderer) = resolve_wgpu_render_proxy_material_renderer(state, render_proxy)
    else {
        return;
    };

    let renderer_data = render_proxy.renderer_data.clone().unwrap();
    let mut guard = renderer_data.write().unwrap();
    let Some(shape_data) = get_wgpu_shape_data(&mut *guard) else {
        return;
    };
    let bounds = get_node_local_bounds_rectangle(&render_proxy.source);
    let w = bounds.width.ceil();
    let h = bounds.height.ceil();
    if w <= 0.0 || h <= 0.0 {
        return;
    }

    let pixel_ratio = state.render_state().pixel_ratio;
    let (Some(canvas_host), Some(image_host)) =
        (state.canvas_host.clone(), state.image_host.clone())
    else {
        return;
    };
    let Some(mut surface) = acquire_wgpu_shape_raster_surface(
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
        rasterizer(&context_handle, &commands, state);
        context.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        if let Some(image) = &shape_data.image {
            invalidate_image_resource(
                image,
                &ensure_scene2d_wgpu_runtime(state).image_resolver_state,
            );
        }
        shape_data.last_content_id = version;
        shape_data.last_pixel_ratio = pixel_ratio;
        shape_data.last_w = w;
        shape_data.last_h = h;
    }

    ensure_wgpu_quad_batch_resources(state);

    let t = &render_proxy.transform_2d;
    let tx = t.tx + t.a * bounds.x + t.c * bounds.y;
    let ty = t.ty + t.b * bounds.x + t.d * bounds.y;

    let Some(image) = shape_data.image.clone() else {
        return;
    };
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
    let raster_shape_transform = create_matrix(t.a, t.b, t.c, t.d, tx, ty);
    write_wgpu_quad_batch_instance(
        &mut get_wgpu_render_state_runtime_mut(state).quad_batch_writer_instance_data,
        base,
        &raster_shape_transform,
        w,
        h,
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
