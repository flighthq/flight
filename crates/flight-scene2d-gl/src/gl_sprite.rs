// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use flight_geometry::{create_matrix3, create_vector2};
use flight_render::{
    BatchFormat, NodeRenderer, RENDER_TARGET_TEXTURE_SOURCE_KIND, RenderProxy2D,
    SCENE2D_WORKING_COLOR_SPACE,
};
use flight_render_gl::{GlRenderState, resolve_gl_texture};
use flight_scene2d::Sprite;
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
    QUAD_BATCH_INSTANCE_FLOATS, ensure_gl_quad_batch_shader, prepare_gl_quad_batch_write,
    record_gl_quad_batch_color_scale_bias, write_gl_quad_batch_affine_instance,
};

pub static GL_SPRITE_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_gl_sprite_renderer_data,
    destroy_data: None,
    is_dirty: Some(is_gl_sprite_renderer_dirty),
    submit: draw_gl_sprite,
};

pub fn draw_gl_sprite(state: &mut GlRenderState, render_proxy: &RenderProxy2D<GlRenderState>) {
    let source = render_proxy.source.read().unwrap();
    let Some(sprite) = source.as_any().downcast_ref::<Sprite>() else {
        return;
    };
    let Some(texture) = &sprite.data.texture else {
        return;
    };
    let texture = texture.read().unwrap();
    if !matches!(&*texture, Texture::Texture2D(_)) || !has_texture_source(&*texture) {
        return;
    }

    let mut sprite_view_size = create_vector2(0.0, 0.0);
    get_texture_view_size(&mut sprite_view_size, &*texture);
    let width = sprite_view_size.x;
    let height = sprite_view_size.y;
    if width <= 0.0 || height <= 0.0 {
        return;
    }

    let Some(material_renderer) = resolve_gl_proxy_material_renderer(state, render_proxy) else {
        return;
    };
    let Some(gl_texture) = resolve_gl_texture(
        state,
        &*texture,
        Some(true),
        Some(SCENE2D_WORKING_COLOR_SPACE),
    ) else {
        return;
    };
    let straight_alpha = current_gl_straight_alpha(state);
    ensure_gl_quad_batch_shader(state);

    let mut sprite_uv_matrix = create_matrix3();
    get_texture_uv_matrix(&mut sprite_uv_matrix, &*texture);
    let uv = sprite_uv_matrix.m;
    let mut uv_origin_y = uv[7];
    let mut uv_axis_uy = uv[1];
    let mut uv_axis_vy = uv[4];
    // Texture view coordinates are top-origin, while GL render attachments are bottom-origin. Reflect
    // both endpoints so a sub-view keeps selecting the same logical rows (a swap alone only works for
    // the full [0, 1] view).
    if get_texture_source_kind(&*texture).as_deref() == Some(RENDER_TARGET_TEXTURE_SOURCE_KIND) {
        uv_origin_y = 1.0 - uv_origin_y;
        uv_axis_uy = -uv_axis_uy;
        uv_axis_vy = -uv_axis_vy;
    }

    let instance_index = prepare_gl_quad_batch_write(
        state,
        gl_texture,
        straight_alpha,
        Some(&texture.texture_fields().sampler),
        render_proxy.blend_mode.as_ref(),
        render_proxy.material.as_ref(),
        material_renderer,
        1,
        None,
    );
    let base = instance_index * QUAD_BATCH_INSTANCE_FLOATS;
    write_gl_quad_batch_affine_instance(
        &mut state
            .gl_runtime
            .borrow_mut()
            .quad_batch_writer_instance_data,
        base,
        &render_proxy.transform_2d,
        width,
        height,
        uv[6],
        uv_origin_y,
        uv[0],
        uv_axis_uy,
        uv[3],
        uv_axis_vy,
        render_proxy.alpha,
    );
    pack_gl_proxy_material_instance(state, render_proxy.material_data.as_ref(), instance_index);
    record_gl_quad_batch_color_scale_bias(
        state,
        get_gl_render_proxy_color_adjustment(render_proxy).as_ref(),
        instance_index,
    );
    state.gl_runtime.borrow_mut().quad_batch_writer_count += 1;
}
