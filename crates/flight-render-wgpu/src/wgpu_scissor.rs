//! The rectangular-clip scissor stack (TS `wgpuScissor.ts`). Rects are logical; the live pass
//! encoder receives them scaled by the bound target's supersample factor.

use crate::types::*;
use crate::wgpu_command_observer::{WgpuCommandRecord, WgpuScissorRectRecord, record_wgpu_command};
use crate::wgpu_render_state::get_wgpu_render_state_native_device;
use crate::wgpu_render_target::get_wgpu_render_target_supersample_scale;

/// Applies the current scissor rectangle to the state's live pass encoder (TS
/// `applyWgpuScissorRect`). No-op without an active scissor or an open pass. Clamped to a
/// non-negative integer origin and at least 1x1, which the encoder requires.
// flight-lint: allow(conform-params) D17: the live pass encoder is the state's, not a separate argument
pub fn apply_wgpu_scissor_rect(state: &mut WgpuRenderState) {
    let Some(rect) = state.runtime.current_scissor_rect else {
        return;
    };
    let x = rect.x.floor().max(0.0) as u32;
    let y = rect.y.floor().max(0.0) as u32;
    let w = rect.width.ceil().max(1.0) as u32;
    let h = rect.height.ceil().max(1.0) as u32;
    set_wgpu_render_pass_scissor_rect(state, x, y, w, h);
}

/// Pops the topmost scissor rectangle and restores the previous one (TS `popWgpuScissorRect`).
pub fn pop_wgpu_scissor_rect(state: &mut WgpuRenderState) {
    let previous = state.runtime.scissor_stack.pop();
    state.runtime.current_scissor_rect = previous;
}

/// Pushes a pixel-space scissor rectangle and makes it active (TS `pushWgpuScissorRect`). It
/// reaches the encoder only when `apply_wgpu_scissor_rect` is called.
pub fn push_wgpu_scissor_rect(state: &mut WgpuRenderState, rect: &WgpuScissorRect) {
    if let Some(current) = state.runtime.current_scissor_rect {
        state.runtime.scissor_stack.push(current);
    }
    state.runtime.current_scissor_rect = Some(*rect);
}

/// Sets a logical scissor rect on the live pass encoder, scaled to the target's physical extent
/// (TS `setWgpuRenderPassScissorRect`).
// flight-lint: allow(conform-params) D17: the live pass encoder is the state's, not a separate argument
pub fn set_wgpu_render_pass_scissor_rect(
    state: &mut WgpuRenderState,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) {
    let scale = state
        .runtime
        .current_render_target
        .as_ref()
        .map(get_wgpu_render_target_supersample_scale)
        .unwrap_or(1);
    if state.runtime.render_pass.is_none() {
        return;
    }
    let native = get_wgpu_render_state_native_device(state);
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::SetScissorRect(WgpuScissorRectRecord {
            height: height * scale,
            width: width * scale,
            x: x * scale,
            y: y * scale,
        });
    });
    if let Some(pass) = &mut state.runtime.render_pass {
        pass.set_scissor_rect(x * scale, y * scale, width * scale, height * scale);
    }
}
