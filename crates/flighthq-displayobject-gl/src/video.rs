//! GL video renderer — uploads video frames as GL textures and composites them.

use glow::HasContext;

use flighthq_render_gl::GlRenderState;
use flighthq_render_gl::composite_gl_cached_texture;

/// Default GL renderer for video display objects.
pub struct DefaultGlVideoRenderer;

/// Per-node cached video texture data.
///
/// Records the texture key whose GPU texture (held in the shared texture cache)
/// this node last uploaded, so `destroy_gl_video_data` can free it on teardown.
#[derive(Debug, Default)]
pub struct GlVideoData {
    pub last_texture_key: Option<u64>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Allocates per-node video cache data for `render_proxy_id`.
///
/// The frame texture is created lazily on first upload (driven by the resource
/// layer), so a fresh node starts with no texture key.
pub fn create_gl_video_data(_state: &mut GlRenderState, _render_proxy_id: u64) -> GlVideoData {
    GlVideoData {
        last_texture_key: None,
    }
}

/// Frees the GPU texture uploaded for this video's frame when the node is torn
/// down. The texture-cache entry would otherwise leak, since native GL has no
/// WeakMap to release it implicitly.
pub fn destroy_gl_video_data(state: &mut GlRenderState, data: GlVideoData) {
    let Some(key) = data.last_texture_key else {
        return;
    };
    if let Some(texture) = state.runtime.texture_cache.remove(&key) {
        unsafe {
            state.gl.delete_texture(texture);
        }
    }
}

/// Draws a video render proxy by compositing the GL texture holding its current
/// frame as a quad.
///
/// The frame upload (`update_gl_texture` against the cached texture) is driven
/// by the resource layer keyed on `render_proxy_id`; this composites whatever is
/// currently cached, placed and scaled by the render state's 2D transform.
pub fn draw_gl_video(state: &mut GlRenderState, render_proxy_id: u64) {
    composite_gl_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {
    use super::*;

    // create_gl_video_data

    #[test]
    fn create_gl_video_data_starts_without_texture_key() {
        let data = GlVideoData::default();
        assert!(data.last_texture_key.is_none());
    }
}
