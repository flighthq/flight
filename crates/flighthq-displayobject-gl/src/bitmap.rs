//! GL bitmap renderer — submits `Bitmap` display objects into the sprite batch.

use crate::sprite_batch::submit_gl_node_atlas_quad;
use flighthq_render_gl::GlRenderState;

// ---------------------------------------------------------------------------
// Per-node renderer data
// ---------------------------------------------------------------------------

/// Cached per-node state for the GL bitmap renderer.
#[derive(Debug, Default)]
pub struct GlBitmapData {
    pub last_image_version: u64,
    pub texture: Option<glow::Texture>,
}

// ---------------------------------------------------------------------------
// Default renderer instance
// ---------------------------------------------------------------------------

/// Default GL renderer for `Bitmap` display objects.
///
/// Call `register_gl_display_object_renderer` to enable bitmap rendering for the
/// `BitmapKind`.
pub struct DefaultGlBitmapRenderer;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Draws a `Bitmap` render proxy into the active sprite batch, flushing first
/// if the texture or material has changed.
pub fn draw_gl_bitmap(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}
