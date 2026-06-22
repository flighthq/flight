//! wgpu material helpers — color-transform pipeline compilation and the
//! color-transform bitmap draw path.

use flighthq_types::kind::KindId;
use flighthq_types::material::ColorTransformMaterial;

use crate::color_transform_material::{
    get_wgpu_render_proxy_color_transform, register_wgpu_color_transform_materials,
};
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_render_wgpu::write_wgpu_quad_uniforms;
use flighthq_render_wgpu::{
    apply_wgpu_blend_mode, build_wgpu_render_target_bind_group, draw_wgpu_quad,
};

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Draws a render proxy that carries a color-transform material by compositing
/// the texture cached under `render_proxy_id` through the color-transform
/// fragment path (the multiplier/offset is folded into the quad uniforms).
///
/// No-op when no texture is cached for the proxy or no render pass is active.
pub fn draw_wgpu_color_transform_bitmap(state: &mut WgpuRenderState, render_proxy_id: u64) {
    if !state.runtime.texture_cache.contains_key(&render_proxy_id) {
        return;
    }
    if state.runtime.render_pass.is_none() {
        return;
    }

    let color_transform = get_wgpu_render_proxy_color_transform(render_proxy_id, state);
    let transform = state.render_state.render_transform_2d.unwrap_or_default();
    let alpha = state.render_state.render_alpha;
    let blend_mode = state.render_state.render_blend_mode;

    let view = state
        .runtime
        .texture_cache
        .get(&render_proxy_id)
        .expect("texture present after contains check")
        .create_view(&wgpu::TextureViewDescriptor::default());
    let bind_group = build_wgpu_render_target_bind_group(state, &view);

    apply_wgpu_blend_mode(state, blend_mode);
    let uniform_offset = write_wgpu_quad_uniforms(
        state,
        alpha,
        &transform,
        color_transform.as_ref(),
        0.0,
        0.0,
        1.0,
        1.0,
        0.0,
        0.0,
        1.0,
        1.0,
    );
    draw_wgpu_quad(state, uniform_offset, &bind_group);
}

/// Registers the color-transform material renderers on `state` for both
/// `ColorTransformMaterial` and `UniformColorTransformMaterial`.
///
/// Idempotent: subsequent calls return immediately if already registered.
pub fn register_wgpu_color_transform_shader(state: &mut WgpuRenderState) {
    if state
        .runtime
        .material_renderer_map
        .contains_key(&KindId::of::<ColorTransformMaterial>())
    {
        return;
    }
    register_wgpu_color_transform_materials(state);
}

#[cfg(test)]
mod tests {}
