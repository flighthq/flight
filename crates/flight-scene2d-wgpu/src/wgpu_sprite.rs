// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state
//! The sprite renderer (TS `wgpuSprite.ts`): a textured quad through the shared batch, or an
//! immediate draw through a bound bitmap shader.

use std::sync::{Arc, RwLock};

use flight_geometry::{create_matrix3, create_vector2};
use flight_node::{NodeRef, RendererData, RendererDataRef};
use flight_render::{BatchFormat, NodeRenderer, RenderProxy2D, SCENE2D_WORKING_COLOR_SPACE};
use flight_render_wgpu::{
    WgpuRenderState, get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
    resolve_wgpu_apply_blend_mode, resolve_wgpu_shader, resolve_wgpu_texture,
};
use flight_scene2d::{Sprite, create_sprite_renderer_data, is_sprite_renderer_dirty};
use flight_texture::{
    Texture, TextureUvTransform, get_texture_uv_matrix, get_texture_view_size, has_texture_source,
};

use crate::wgpu_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, ensure_wgpu_quad_batch_resources, flush_wgpu_quad_batch_writer,
    get_wgpu_render_proxy_color_adjustment, pack_wgpu_quad_batch_material_instance,
    prepare_wgpu_quad_batch_write, record_wgpu_quad_batch_color_scale_bias,
    resolve_wgpu_render_proxy_material_renderer, write_wgpu_quad_batch_affine_instance,
};

/// The sprite renderer (TS `wgpuSpriteRenderer`).
pub static WGPU_SPRITE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_wgpu_sprite_renderer_data,
    destroy_data: None,
    is_dirty: Some(is_wgpu_sprite_renderer_dirty),
    submit: draw_wgpu_sprite,
};

// TS `createSpriteRendererData` as a wgpu `NodeRenderer.create_data` callback.
pub(crate) fn create_wgpu_sprite_renderer_data(
    _state: &mut WgpuRenderState,
    source: &NodeRef,
) -> Option<RendererDataRef> {
    let data = create_sprite_renderer_data(&*source.read().unwrap());
    return Some(Arc::new(RwLock::new(data)));
}

/// Draws a sprite (TS `drawWgpuSprite`): a bound bitmap shader draws it immediately; otherwise it
/// writes one affine instance (pre-scaled geometry, the texture's UV transform) into the batch.
pub fn draw_wgpu_sprite(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let texture = {
        let source = render_proxy.source.read().unwrap();
        let Some(sprite) = source.as_any().downcast_ref::<Sprite>() else {
            return;
        };
        let Some(texture) = sprite.data.texture.clone() else {
            return;
        };
        texture
    };
    let texture = texture.read().unwrap();
    if !matches!(&*texture, Texture::Texture2D(_)) || !has_texture_source(&*texture) {
        return;
    }

    if let Some(shader) = resolve_wgpu_shader(state, render_proxy) {
        flush_wgpu_quad_batch_writer(state);
        if let Some(apply_blend_mode) = resolve_wgpu_apply_blend_mode(state) {
            apply_blend_mode(state, render_proxy.blend_mode.as_ref());
        }
        if resolve_wgpu_texture(
            state,
            &*texture,
            Some(true),
            Some(SCENE2D_WORKING_COLOR_SPACE),
        )
        .is_none()
        {
            return;
        }
        (shader.bind)(state, render_proxy.alpha);
        return;
    }

    let mut sprite_view_size = create_vector2(0.0, 0.0);
    get_texture_view_size(&mut sprite_view_size, &*texture);
    let width = sprite_view_size.x;
    let height = sprite_view_size.y;
    if width <= 0.0 || height <= 0.0 {
        return;
    }

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
    ensure_wgpu_quad_batch_resources(state);

    let mut sprite_uv_matrix = create_matrix3();
    get_texture_uv_matrix(&mut sprite_uv_matrix, &*texture);
    let uv = sprite_uv_matrix.m;

    let instance_index = prepare_wgpu_quad_batch_write(
        state,
        &texture_entry,
        Some(&texture.texture_fields().sampler),
        render_proxy.blend_mode.as_ref(),
        render_proxy.material.as_ref(),
        &material_renderer,
        1,
        None,
    );
    let base = instance_index as usize * QUAD_BATCH_INSTANCE_FLOATS;
    write_wgpu_quad_batch_affine_instance(
        &mut get_wgpu_render_state_runtime_mut(state).quad_batch_writer_instance_data,
        base,
        &render_proxy.transform_2d,
        width,
        height,
        uv[6],
        uv[7],
        uv[0],
        uv[1],
        uv[3],
        uv[4],
        render_proxy.alpha,
    );
    pack_wgpu_quad_batch_material_instance(
        state,
        render_proxy.material_data.as_ref(),
        instance_index,
    );
    record_wgpu_quad_batch_color_scale_bias(
        state,
        get_wgpu_render_proxy_color_adjustment(render_proxy).as_ref(),
        instance_index,
    );
    get_wgpu_render_state_runtime_mut(state).quad_batch_writer_count += 1;
}

// TS `isSpriteRendererDirty` as a wgpu `NodeRenderer.is_dirty` callback.
pub(crate) fn is_wgpu_sprite_renderer_dirty(
    _state: &WgpuRenderState,
    source: &NodeRef,
    renderer_data: Option<&RendererDataRef>,
) -> bool {
    let Some(renderer_data) = renderer_data else {
        return is_sprite_renderer_dirty(&*source.read().unwrap(), None);
    };
    let mut guard = renderer_data.write().unwrap();
    let data: &mut dyn RendererData = &mut *guard;
    return is_sprite_renderer_dirty(&*source.read().unwrap(), Some(data));
}
