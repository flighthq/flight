//! wgpu clip support — installs scissor (rect) and stencil-contour clip hooks.

use flighthq_render_wgpu::WgpuRenderState;

/// Installs the unified wgpu clip hooks on `state`, enabling both scissor
/// (rect-form) and stencil-contour (path-form) clipping.
///
/// The Rust `RenderState` does not yet carry function-pointer clip-hook slots
/// (the TS backend assigns `state.pushClipRectangle` / `state.pushClipContour`).
/// Until those slots exist, clip support is opt-in by calling the
/// `push_wgpu_clip_rectangle` / `pop_wgpu_clip_rectangle` (and contour) functions
/// directly. This function resets the clip-tracking state so a fresh render pass
/// starts with no active clip layers.
pub fn enable_wgpu_clip_support(state: &mut WgpuRenderState) {
    state.runtime.current_scissor_rect = None;
    state.runtime.scissor_stack.clear();
    state.runtime.clip_forms.clear();
    state.runtime.current_mask_depth = 0;
    state.runtime.mask_write_mode = false;
}

#[cfg(test)]
mod tests {}
