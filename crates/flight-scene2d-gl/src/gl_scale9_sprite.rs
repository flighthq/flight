// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use flight_geometry::{create_matrix, create_matrix3, create_rectangle, create_vector2};
use flight_render::{
    BatchFormat, NodeRenderer, RENDER_TARGET_TEXTURE_SOURCE_KIND, RenderProxy2D,
    SCENE2D_WORKING_COLOR_SPACE,
};
use flight_render_gl::{GlRenderState, resolve_gl_texture};
use flight_scene2d::Scale9Sprite;
use flight_texture::{
    Texture, TextureUvTransform, get_texture_source_kind, get_texture_uv_matrix,
    get_texture_view_size, has_texture_source,
};

use crate::gl_color_adjustment_material_feature::get_gl_render_proxy_color_adjustment;
use crate::gl_quad_batch_common::{
    create_gl_sprite_renderer_data, current_gl_straight_alpha, is_gl_sprite_renderer_dirty,
    pack_gl_proxy_material_instance, resolve_gl_proxy_material_renderer,
};
use crate::gl_quad_batch_writer::{
    ensure_gl_quad_batch_shader, prepare_gl_quad_batch_write, record_gl_quad_batch_color_scale_bias,
    write_gl_quad_batch_affine_instance,
};
use crate::gl_scale9_mapper::build_gl_scale9_mapper;

const INSTANCE_FLOATS: usize = 13;
const SCALE9_QUAD_COUNT: usize = 9;

pub static GL_SCALE9_SPRITE_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_gl_sprite_renderer_data,
    destroy_data: None,
    is_dirty: Some(is_gl_sprite_renderer_dirty),
    submit: draw_gl_scale9_sprite,
};

pub fn draw_gl_scale9_sprite(state: &mut GlRenderState, render_proxy: &RenderProxy2D<GlRenderState>) {
    let source = render_proxy.source.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<Scale9Sprite>() else {
        return;
    };
    let Some(texture) = &source.data.texture else {
        return;
    };
    let texture = texture.read().unwrap();
    if !matches!(&*texture, Texture::Texture2D(_)) || !has_texture_source(&*texture) {
        return;
    }

    let mut scale9_view_size = create_vector2(0.0, 0.0);
    get_texture_view_size(&mut scale9_view_size, &*texture);
    let width = scale9_view_size.x;
    let height = scale9_view_size.y;
    if width <= 0.0 || height <= 0.0 {
        return;
    }

    let Some(mapper) = build_gl_scale9_mapper(
        &create_rectangle(0.0, 0.0, width, height),
        &source.data.scale9_grid,
        source.scale_x,
        source.scale_y,
    ) else {
        return;
    };

    let Some(material_renderer) = resolve_gl_proxy_material_renderer(state, render_proxy) else {
        return;
    };
    let Some(gl_texture) =
        resolve_gl_texture(state, &*texture, Some(true), Some(SCENE2D_WORKING_COLOR_SPACE))
    else {
        return;
    };
    let straight_alpha = current_gl_straight_alpha(state);
    ensure_gl_quad_batch_shader(state);

    let mut scale9_uv_matrix = create_matrix3();
    get_texture_uv_matrix(&mut scale9_uv_matrix, &*texture);
    let uv = scale9_uv_matrix.m;
    let reflect_v =
        get_texture_source_kind(&*texture).as_deref() == Some(RENDER_TARGET_TEXTURE_SOURCE_KIND);

    let grid = &source.data.scale9_grid;
    let source_x = [0.0, grid.x, grid.x + grid.width, width];
    let source_y = [0.0, grid.y, grid.y + grid.height, height];
    let target_x = source_x.map(|value| (mapper.map_x)(value));
    let target_y = source_y.map(|value| (mapper.map_y)(value));

    let base = prepare_gl_quad_batch_write(
        state,
        gl_texture,
        straight_alpha,
        Some(&texture.texture_fields().sampler),
        render_proxy.blend_mode.as_ref(),
        render_proxy.material.as_ref(),
        material_renderer,
        SCALE9_QUAD_COUNT,
        None,
    );
    let start_count = state.gl_runtime.borrow().quad_batch_writer_count;
    let transform = &render_proxy.transform_2d;
    let a = transform.a / source.scale_x;
    let b = transform.b / source.scale_x;
    let c = transform.c / source.scale_y;
    let d = transform.d / source.scale_y;
    let color_scale_bias = get_gl_render_proxy_color_adjustment(render_proxy);
    let mut slice_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);

    // The source seeds the float cursor with the returned instance index (not index * stride);
    // translated as written.
    let mut write_base = base;
    for row in 0..3 {
        for column in 0..3 {
            let instance_index = start_count + row * 3 + column;
            let x = target_x[column];
            let y = target_y[row];
            let local_u = source_x[column] / width;
            let local_v = source_y[row] / height;
            let delta_u = (source_x[column + 1] - source_x[column]) / width;
            let delta_v = (source_y[row + 1] - source_y[row]) / height;
            let uv_origin_y = uv[7] + uv[1] * local_u + uv[4] * local_v;
            slice_transform.a = a;
            slice_transform.b = b;
            slice_transform.c = c;
            slice_transform.d = d;
            slice_transform.tx = a * x + c * y + transform.tx;
            slice_transform.ty = b * x + d * y + transform.ty;
            write_gl_quad_batch_affine_instance(
                &mut state.gl_runtime.borrow_mut().quad_batch_writer_instance_data,
                write_base,
                &slice_transform,
                target_x[column + 1] - x,
                target_y[row + 1] - y,
                uv[6] + uv[0] * local_u + uv[3] * local_v,
                if reflect_v { 1.0 - uv_origin_y } else { uv_origin_y },
                uv[0] * delta_u,
                (if reflect_v { -uv[1] } else { uv[1] }) * delta_u,
                uv[3] * delta_v,
                (if reflect_v { -uv[4] } else { uv[4] }) * delta_v,
                render_proxy.alpha,
            );
            pack_gl_proxy_material_instance(
                state,
                render_proxy.material_data.as_ref(),
                instance_index,
            );
            record_gl_quad_batch_color_scale_bias(
                state,
                color_scale_bias.as_ref(),
                instance_index,
            );
            write_base += INSTANCE_FLOATS;
        }
    }

    state.gl_runtime.borrow_mut().quad_batch_writer_count += SCALE9_QUAD_COUNT;
}
