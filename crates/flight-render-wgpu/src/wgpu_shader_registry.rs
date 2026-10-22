//! The state-wide default bitmap shader (TS `wgpuShaderRegistry.ts`).

use crate::types::*;

/// Registers a custom bitmap shader as the state-wide default, replacing the built-in quad shader
/// (TS `registerWgpuBitmapShader`), so a whole state swaps pipelines without per-node bindings.
pub fn register_wgpu_bitmap_shader(state: &mut WgpuRenderState, shader: WgpuBitmapShader) {
    state.runtime.default_bitmap_shader = Some(shader);
}
