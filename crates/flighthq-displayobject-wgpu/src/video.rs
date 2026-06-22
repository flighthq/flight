//! wgpu video renderer — uploads video frames as textures and composites them.

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_render_wgpu::composite_wgpu_cached_texture;

/// Default wgpu renderer for video display objects.
pub struct DefaultWgpuVideoRenderer;

/// Per-node cached video texture data.
#[derive(Debug, Default)]
pub struct WgpuVideoData {
    pub last_frame_version: u64,
    pub texture: Option<wgpu::Texture>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Allocates per-node video cache data for `render_proxy_id`.
///
/// The frame texture is created lazily on first upload (driven by the resource
/// layer), so a fresh node starts with no texture and an unset frame version.
pub fn create_wgpu_video_data(
    _state: &mut WgpuRenderState,
    _render_proxy_id: u64,
) -> WgpuVideoData {
    WgpuVideoData {
        last_frame_version: 0,
        texture: None,
    }
}

/// Frees the per-node video cache data and its texture.
pub fn destroy_wgpu_video_data(_state: &WgpuRenderState, data: WgpuVideoData) {
    if let Some(texture) = data.texture {
        texture.destroy();
    }
}

/// Draws a video render proxy by compositing the texture holding its current
/// frame as a textured quad.
///
/// The frame upload (`update_wgpu_texture` against the cached texture keyed on
/// `render_proxy_id`) is driven by the resource layer; this composites whatever
/// is currently cached, placed and scaled by the render state's 2D transform.
pub fn draw_wgpu_video(state: &mut WgpuRenderState, render_proxy_id: u64) {
    composite_wgpu_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}
