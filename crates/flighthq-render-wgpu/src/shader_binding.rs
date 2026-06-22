//! Per-node wgpu shader bindings — associates a custom `WgpuBitmapShader` with
//! a specific render proxy for a given render state.

use crate::render_state::WgpuRenderState;
use crate::shader::WgpuBitmapShader;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Returns the per-node shader override for `render_proxy_id`, if any.
pub fn get_wgpu_shader(state: &WgpuRenderState, render_proxy_id: u64) -> Option<&WgpuBitmapShader> {
    state.runtime.shader_map.get(&render_proxy_id)
}

/// Resolves the shader to use for `render_proxy_id`:
/// 1. Per-node binding (if set via `set_wgpu_shader`).
/// 2. `state`'s default bitmap shader.
///
/// # Panics
/// Panics if no per-node binding exists and no default bitmap shader has been
/// installed on `state` — a programmer error (the render pipeline must install a
/// default before drawing).
pub fn resolve_wgpu_shader(state: &WgpuRenderState, render_proxy_id: u64) -> &WgpuBitmapShader {
    if let Some(shader) = state.runtime.shader_map.get(&render_proxy_id) {
        return shader;
    }
    state
        .runtime
        .default_bitmap_shader
        .as_ref()
        .expect("resolve_wgpu_shader called before a default bitmap shader was installed")
}

/// Binds `shader` to `render_proxy_id` for this render state, or removes the
/// binding when `shader` is `None`.
pub fn set_wgpu_shader(
    state: &mut WgpuRenderState,
    render_proxy_id: u64,
    shader: Option<WgpuBitmapShader>,
) {
    match shader {
        Some(shader) => {
            state.runtime.shader_map.insert(render_proxy_id, shader);
        }
        None => {
            state.runtime.shader_map.remove(&render_proxy_id);
        }
    }
}

#[cfg(test)]
mod tests {}
