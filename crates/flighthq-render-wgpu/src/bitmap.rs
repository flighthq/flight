//! wgpu bitmap renderer — draws `Bitmap` display objects as a textured quad.
//!
//! Geometry reaches this module by node id: the scene walk passes a closure that
//! resolves `node_id -> Option<WgpuBitmapTexture>` (the cleanest seam, mirroring
//! `WgpuShapeGeometry` for shapes). The pixel source is uploaded into a cached
//! `wgpu::Texture` (keyed by `image_id`) and drawn through the bitmap quad
//! pipeline with the node's current 2D transform, alpha, and blend mode.

use crate::draw::{bind_wgpu_texture, build_wgpu_render_target_bind_group, draw_wgpu_quad};
use crate::render_state::WgpuRenderState;
use crate::shader::write_wgpu_quad_uniforms;

/// Resolved texture source for one `Bitmap` node: the premultiplied RGBA8 pixel
/// bytes, the texel dimensions, the local-space quad size to draw, and an
/// `image_id` + `version` pair used as the texture cache key. The draw walk
/// passes this through to the bitmap draw, which uploads on first use (or when
/// the cache misses) and draws the quad.
///
/// `pixels` is `width * height * 4` bytes in premultiplied RGBA8, top-left
/// origin — the same convention `bind_wgpu_texture` expects.
pub struct WgpuBitmapTexture {
    pub image_id: u64,
    pub version: u64,
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub draw_width: f32,
    pub draw_height: f32,
}

/// Default wgpu renderer for `Bitmap` display objects.
///
/// Call `register_wgpu_display_object_renderer` or add this to the renderer
/// registry for the `BitmapKind` to enable bitmap rendering.
pub struct DefaultWgpuBitmapRenderer;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Draws a `Bitmap` whose texture source is resolved by id. Uploads the pixel
/// data into a cached texture (keyed by `texture.image_id`), then draws a quad
/// of `texture.draw_width` × `texture.draw_height` using the render state's
/// current 2D transform, alpha, and blend mode. No-op without an active pass.
///
/// This is the texture-backed bitmap path the scene walk uses. The id-less
/// `draw_wgpu_bitmap` remains for the legacy sprite-batch atlas slot.
pub fn draw_wgpu_bitmap_texture(state: &mut WgpuRenderState, texture: &WgpuBitmapTexture) {
    if state.runtime.render_pass.is_none() {
        return;
    }

    bind_wgpu_texture(
        state,
        texture.image_id,
        &texture.pixels,
        texture.width,
        texture.height,
        texture.version,
    );

    let view = state
        .runtime
        .texture_cache
        .get(&texture.image_id)
        .expect("texture present after bind")
        .create_view(&wgpu::TextureViewDescriptor::default());
    let bind_group = build_wgpu_render_target_bind_group(state, &view);

    let transform = state.render_state.render_transform_2d.unwrap_or_default();
    let alpha = state.render_state.render_alpha;
    let blend = state.render_state.render_blend_mode;
    state.runtime.current_blend_mode = blend;

    let uniform_offset = write_wgpu_quad_uniforms(
        state,
        alpha,
        &transform,
        None,
        0.0,
        0.0,
        texture.draw_width,
        texture.draw_height,
        0.0,
        0.0,
        1.0,
        1.0,
    );
    draw_wgpu_quad(state, uniform_offset, &bind_group);
}

/// Legacy id-only bitmap draw: submits a unit atlas quad into the sprite batch
/// for `render_proxy_id`. Retained for the atlas-batched path; the scene walk
/// uses `draw_wgpu_bitmap_texture` when a texture source is available.
pub fn draw_wgpu_bitmap(state: &mut WgpuRenderState, render_proxy_id: u64) {
    crate::sprite_batch::submit_wgpu_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}
