//! wgpu shape renderer — vector shape drawing via a canvas-rasterised texture.
//!
//! Shapes are rasterised to an offscreen texture and composited through the
//! standard textured-quad pipeline, mirroring `draw_gl_shape`. The GPU
//! tessellated-fill path is available separately via `draw_wgpu_shape_meshes`.

use crate::draw::composite_wgpu_cached_texture;
use crate::render_state::WgpuRenderState;

/// Default wgpu renderer for vector `Shape` nodes.
pub struct DefaultWgpuShapeRenderer;

/// Draws a shape `render_proxy_id` using its rasterised texture, compositing it
/// through the standard textured-quad pipeline.
pub fn draw_wgpu_shape(state: &mut WgpuRenderState, render_proxy_id: u64) {
    composite_wgpu_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}
