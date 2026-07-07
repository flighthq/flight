//! wgpu shader registry — the state-wide default bitmap shader setter.
//!
//! Ports the TS `@flighthq/render-wgpu/wgpuShaderRegistry` helper and mirrors
//! the render-gl `register_gl_bitmap_shader` seam.

use crate::render_state::WgpuRenderState;
use crate::shader::WgpuBitmapShader;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Registers a custom bitmap shader as the state-wide default, replacing the
/// built-in quad shader. Use this to globally swap the render pipeline (for
/// example a custom color-transform or tint shader) without per-node bindings.
pub fn register_wgpu_bitmap_shader(state: &mut WgpuRenderState, shader: WgpuBitmapShader) {
    state.runtime.default_bitmap_shader = Some(shader);
}
