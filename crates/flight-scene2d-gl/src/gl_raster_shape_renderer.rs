// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use flight_geometry::create_matrix;
use flight_node::{get_node_local_bounds_rectangle, get_node_local_content_revision};
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, RenderRegistryTable, create_canvas_host_surface,
    destroy_canvas_host_surface, emit_render_registry_miss,
};
use flight_render_gl::{GlRenderState, bind_gl_image_resource_texture};
use flight_shape::contract::SHAPE_KIND;
use flight_surface::SurfaceRef;
use flight_texture::TextureColorSpace;

use crate::gl_color_adjustment_material_feature::get_gl_render_proxy_color_adjustment;
use crate::gl_quad_batch_common::{
    current_gl_straight_alpha, pack_gl_proxy_material_instance, resolve_gl_proxy_material_renderer,
};
use crate::gl_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, ensure_gl_quad_batch_shader, prepare_gl_quad_batch_write,
    record_gl_quad_batch_color_scale_bias, write_gl_quad_batch_instance,
};
use crate::gl_shape_commands::get_gl_shape_commands;
use crate::gl_shape_data::{
    acquire_gl_shape_raster_surface, create_gl_shape_data, delete_gl_premultiplied_image_texture,
    destroy_gl_shape_data, get_gl_shape_data,
};
use crate::gl_shape_rasterizer::get_gl_shape_rasterizer;
use crate::scene2d_gl_runtime::invalidate_gl_surface_image;

// The canvas-only shape strategy: every shape rasterizes through the registered rasterizer, and this
// module never references the tessellator. Choosing it means the full canvas command vocabulary must
// be registered on this state, unconditionally: every shape replays its whole command stream.
pub static GL_RASTER_SHAPE_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_gl_shape_data,
    destroy_data: Some(destroy_gl_shape_data),
    is_dirty: None,
    submit: draw_gl_raster_shape,
};

// Replays the shape's whole command stream into an offscreen 2D canvas and draws the result as one
// textured quad. Drawing at all is the registered rasterizer's job, so an absent one is reported
// rather than quietly dropping the shape.
pub fn draw_gl_raster_shape(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
) {
    let Some(renderer_data) = &render_proxy.renderer_data else {
        return;
    };
    {
        let source = render_proxy.source.read().unwrap();
        if get_gl_shape_commands(&*source).is_none_or(|commands| commands.is_empty()) {
            return;
        }
    }

    let Some(rasterizer) = get_gl_shape_rasterizer(state) else {
        emit_render_registry_miss(
            state,
            RenderRegistryTable::ShapeRasterizer,
            SHAPE_KIND.to_string(),
        );
        return;
    };

    let Some(material_renderer) = resolve_gl_proxy_material_renderer(state, render_proxy) else {
        return;
    };

    let bounds = get_node_local_bounds_rectangle(&render_proxy.source);
    let source = render_proxy.source.read().unwrap();
    let commands = get_gl_shape_commands(&*source).unwrap_or(&[]);
    let version = i64::from(get_node_local_content_revision(&*source));
    let w = bounds.width.ceil();
    let h = bounds.height.ceil();
    if w <= 0.0 || h <= 0.0 {
        return;
    }

    // The raster is the shape's own pixels, so it is sized in device pixels and the replay is
    // pre-scaled to match. The quad below stays in local units and samples the whole texture, so a
    // denser raster is only sharper. The pixel ratio joins the invalidation check because a state
    // that changes it must re-rasterize at the new density.
    let pixel_ratio = state.render.pixel_ratio;
    let (Some(canvas_host), Some(image_host)) =
        (state.canvas_host.clone(), state.image_host.clone())
    else {
        return;
    };
    let mut guard = renderer_data.write().unwrap();
    let Some(shape_data) = get_gl_shape_data(&mut *guard) else {
        return;
    };
    let Some(mut surface) = acquire_gl_shape_raster_surface(
        &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
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
        rasterizer(&context, commands, state);
        canvas.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        // Re-reads the surface dimensions and bumps the resource version so the batch's
        // version-aware cache re-uploads from the updated backing store.
        if let Some(image) = &shape_data.image {
            invalidate_gl_surface_image(state, image);
        }
        shape_data.last_content_id = version;
        shape_data.last_pixel_ratio = pixel_ratio;
        shape_data.last_w = w;
        shape_data.last_h = h;
    }
    let image = shape_data.image.clone();
    drop(guard);
    drop(source);

    ensure_gl_quad_batch_shader(state);

    let t = &render_proxy.transform_2d;
    let tx = t.tx + t.a * bounds.x + t.c * bounds.y;
    let ty = t.ty + t.b * bounds.x + t.d * bounds.y;

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
    let raster_shape_transform = create_matrix(t.a, t.b, t.c, t.d, tx, ty);
    write_gl_quad_batch_instance(
        &mut state
            .gl_runtime
            .borrow_mut()
            .quad_batch_writer_instance_data,
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
    pack_gl_proxy_material_instance(state, render_proxy.material_data.as_ref(), start_instance);
    record_gl_quad_batch_color_scale_bias(
        state,
        get_gl_render_proxy_color_adjustment(render_proxy).as_ref(),
        start_instance,
    );
    state.gl_runtime.borrow_mut().quad_batch_writer_count += 1;
}
