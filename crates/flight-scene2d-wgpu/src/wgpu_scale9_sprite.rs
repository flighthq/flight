// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state
//! The nine-slice sprite renderer (TS `wgpuScale9Sprite.ts`): nine affine instances whose corners
//! keep their texel size while the center stretches.

use flight_geometry::{create_matrix, create_matrix3, create_rectangle, create_vector2};
use flight_render::{BatchFormat, NodeRenderer, RenderProxy2D, SCENE2D_WORKING_COLOR_SPACE};
use flight_render_wgpu::{
    WgpuRenderState, get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
    resolve_wgpu_texture,
};
use flight_scene2d::Scale9Sprite;
use flight_texture::{
    Texture, TextureUvTransform, get_texture_uv_matrix, get_texture_view_size, has_texture_source,
};

use crate::wgpu_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, get_wgpu_render_proxy_color_adjustment,
    pack_wgpu_quad_batch_material_instance, prepare_wgpu_quad_batch_write,
    record_wgpu_quad_batch_color_scale_bias, resolve_wgpu_render_proxy_material_renderer,
    write_wgpu_quad_batch_affine_instance,
};
use crate::wgpu_scale9_mapper::build_wgpu_scale9_mapper;
use crate::wgpu_sprite::{create_wgpu_sprite_renderer_data, is_wgpu_sprite_renderer_dirty};

const SLICE_COUNT: u32 = 9;

/// The nine-slice sprite renderer (TS `wgpuScale9SpriteRenderer`).
pub static WGPU_SCALE9_SPRITE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_wgpu_sprite_renderer_data,
    destroy_data: None,
    is_dirty: Some(is_wgpu_sprite_renderer_dirty),
    submit: draw_wgpu_scale9_sprite,
};

/// Draws a nine-slice sprite (TS `drawWgpuScale9Sprite`): the node scale is stripped from the
/// transform and re-applied through the slice mapping, so corners keep their texel size.
pub fn draw_wgpu_scale9_sprite(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let (scale9_grid, texture, scale_x, scale_y) = {
        let source = render_proxy.source.read().unwrap();
        let Some(source) = source.as_any().downcast_ref::<Scale9Sprite>() else {
            return;
        };
        let Some(texture) = source.data.texture.clone() else {
            return;
        };
        (
            source.data.scale9_grid.clone(),
            texture,
            source.scale_x,
            source.scale_y,
        )
    };
    let texture = texture.read().unwrap();
    if !matches!(&*texture, Texture::Texture2D(_)) || !has_texture_source(&*texture) {
        return;
    }

    let mut scale9_view_size = create_vector2(0.0, 0.0);
    get_texture_view_size(&mut scale9_view_size, &*texture);
    let width = scale9_view_size.x;
    let height = scale9_view_size.y;
    let Some(mapper) = build_wgpu_scale9_mapper(
        &create_rectangle(0.0, 0.0, width, height),
        &scale9_grid,
        scale_x,
        scale_y,
    ) else {
        return;
    };

    let Some(material_renderer) = resolve_wgpu_render_proxy_material_renderer(state, render_proxy)
    else {
        return;
    };
    let Some(texture_entry) = resolve_wgpu_texture(
        state,
        &*texture,
        Some(true),
        Some(SCENE2D_WORKING_COLOR_SPACE),
    ) else {
        return;
    };

    let mut scale9_uv_matrix = create_matrix3();
    get_texture_uv_matrix(&mut scale9_uv_matrix, &*texture);
    let uv = scale9_uv_matrix.m;

    let source_xs = [0.0, scale9_grid.x, scale9_grid.x + scale9_grid.width, width];
    let source_ys = [
        0.0,
        scale9_grid.y,
        scale9_grid.y + scale9_grid.height,
        height,
    ];
    let target_xs = source_xs.map(|value| (mapper.map_x)(value));
    let target_ys = source_ys.map(|value| (mapper.map_y)(value));

    let base = prepare_wgpu_quad_batch_write(
        state,
        &texture_entry,
        Some(&texture.texture_fields().sampler),
        render_proxy.blend_mode.as_ref(),
        render_proxy.material.as_ref(),
        &material_renderer,
        SLICE_COUNT,
        None,
    );
    // Reservation may flush an incompatible batch, so all parallel instance streams must index from
    // the writer count observed after prepare_wgpu_quad_batch_write.
    let start_count = get_wgpu_render_state_runtime(state).quad_batch_writer_count;
    let transform = &render_proxy.transform_2d;
    let a = transform.a / scale_x;
    let b = transform.b / scale_x;
    let c = transform.c / scale_y;
    let d = transform.d / scale_y;
    let color_scale_bias = get_wgpu_render_proxy_color_adjustment(render_proxy);

    // The returned value is an instance index, so the float cursor starts at index * stride. (The TS
    // source seeds the cursor with the bare index, which writes into the wrong instance whenever the
    // batch already holds instances; a real bug, fixed here by principal ruling.)
    let mut write_base = base as usize * QUAD_BATCH_INSTANCE_FLOATS;
    let mut instance = 0;
    let mut slice_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    for row in 0..3 {
        let y = target_ys[row];
        let slice_height = target_ys[row + 1] - y;
        for column in 0..3 {
            let x = target_xs[column];
            let slice_width = target_xs[column + 1] - x;
            let local_u = source_xs[column] / width;
            let local_v = source_ys[row] / height;
            let delta_u = (source_xs[column + 1] - source_xs[column]) / width;
            let delta_v = (source_ys[row + 1] - source_ys[row]) / height;
            slice_transform.a = a;
            slice_transform.b = b;
            slice_transform.c = c;
            slice_transform.d = d;
            slice_transform.tx = a * x + c * y + transform.tx;
            slice_transform.ty = b * x + d * y + transform.ty;
            write_wgpu_quad_batch_affine_instance(
                &mut get_wgpu_render_state_runtime_mut(state).quad_batch_writer_instance_data,
                write_base,
                &slice_transform,
                slice_width,
                slice_height,
                uv[6] + uv[0] * local_u + uv[3] * local_v,
                uv[7] + uv[1] * local_u + uv[4] * local_v,
                uv[0] * delta_u,
                uv[1] * delta_u,
                uv[3] * delta_v,
                uv[4] * delta_v,
                render_proxy.alpha,
            );
            pack_wgpu_quad_batch_material_instance(
                state,
                render_proxy.material_data.as_ref(),
                start_count + instance,
            );
            record_wgpu_quad_batch_color_scale_bias(
                state,
                color_scale_bias.as_ref(),
                start_count + instance,
            );
            write_base += QUAD_BATCH_INSTANCE_FLOATS;
            instance += 1;
        }
    }
    get_wgpu_render_state_runtime_mut(state).quad_batch_writer_count += SLICE_COUNT;
}
