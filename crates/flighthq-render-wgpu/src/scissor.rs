//! wgpu scissor stack — a pixel-space scissor-rect stack tracked on the render
//! runtime and applied to the active render pass on demand.
//!
//! Ports the TS `@flighthq/render-wgpu/wgpuScissor` helpers. The scissor rect is
//! tracked here but only pushed to the GPU pass when `apply_wgpu_scissor_rect`
//! is called, keeping push/pop pass-agnostic so callers can batch the apply.

use crate::render_state::{WgpuRenderState, WgpuScissorRect};

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Applies the current scissor rectangle to the active render pass. No-op when
/// there is no active scissor or no open render pass. Call after each draw call
/// or once per pass when the active scissor changes.
pub fn apply_wgpu_scissor_rect(state: &mut WgpuRenderState) {
    let Some(rect) = state.runtime.current_scissor_rect else {
        return;
    };
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    // set_scissor_rect requires non-zero dimensions. The rect fields are already
    // non-negative integers (u32), so only the width/height need clamping to 1.
    let [x, y, width, height] = wgpu_scissor_pass_dimensions(&rect);
    pass.set_scissor_rect(x, y, width, height);
}

/// Pops the topmost scissor rectangle from the stack and restores the previous
/// one (or clears the current scissor if the stack is empty). Call after
/// finishing the draw calls the pushed scissor was scoped to. No-op semantics
/// when the stack is empty: the current scissor becomes `None`.
pub fn pop_wgpu_scissor_rect(state: &mut WgpuRenderState) {
    pop_scissor(
        &mut state.runtime.current_scissor_rect,
        &mut state.runtime.scissor_stack,
    );
}

/// Pushes a pixel-space scissor rectangle onto the stack and sets it as the
/// active scissor. Call `apply_wgpu_scissor_rect` with an open render pass to
/// push it to the GPU; this function only tracks it.
pub fn push_wgpu_scissor_rect(state: &mut WgpuRenderState, rect: &WgpuScissorRect) {
    push_scissor(
        &mut state.runtime.current_scissor_rect,
        &mut state.runtime.scissor_stack,
        *rect,
    );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Resolves the `(x, y, width, height)` a scissor rect applies to the GPU pass,
// clamping the dimensions to at least 1×1 so the call is always valid even for
// a degenerate clip.
fn wgpu_scissor_pass_dimensions(rect: &WgpuScissorRect) -> [u32; 4] {
    [rect.x, rect.y, rect.width.max(1), rect.height.max(1)]
}

// Pops the current scissor off the stack: the current rect becomes the previous
// stack top, or `None` when the stack is empty.
fn pop_scissor(current: &mut Option<WgpuScissorRect>, stack: &mut Vec<WgpuScissorRect>) {
    *current = stack.pop();
}

// Pushes `rect` as the active scissor, stacking the previous current rect (if
// any) so `pop_scissor` can restore it.
fn push_scissor(
    current: &mut Option<WgpuScissorRect>,
    stack: &mut Vec<WgpuScissorRect>,
    rect: WgpuScissorRect,
) {
    if let Some(previous) = *current {
        stack.push(previous);
    }
    *current = Some(rect);
}

#[cfg(test)]
mod tests {
    use super::*;

    // pop_scissor

    #[test]
    fn pop_scissor_clears_current_when_stack_empty() {
        let mut current = Some(WgpuScissorRect {
            x: 1,
            y: 2,
            width: 3,
            height: 4,
        });
        let mut stack: Vec<WgpuScissorRect> = Vec::new();
        pop_scissor(&mut current, &mut stack);
        assert_eq!(current, None);
    }

    #[test]
    fn pop_scissor_restores_previous_after_push_pair() {
        let r1 = WgpuScissorRect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };
        let r2 = WgpuScissorRect {
            x: 10,
            y: 10,
            width: 50,
            height: 50,
        };
        let mut current: Option<WgpuScissorRect> = None;
        let mut stack: Vec<WgpuScissorRect> = Vec::new();
        push_scissor(&mut current, &mut stack, r1);
        push_scissor(&mut current, &mut stack, r2);
        pop_scissor(&mut current, &mut stack);
        assert_eq!(current, Some(r1));
        pop_scissor(&mut current, &mut stack);
        assert_eq!(current, None);
    }

    // push_scissor

    #[test]
    fn push_scissor_sets_current_on_first_push() {
        let rect = WgpuScissorRect {
            x: 5,
            y: 10,
            width: 80,
            height: 40,
        };
        let mut current: Option<WgpuScissorRect> = None;
        let mut stack: Vec<WgpuScissorRect> = Vec::new();
        push_scissor(&mut current, &mut stack, rect);
        assert_eq!(current, Some(rect));
        assert!(stack.is_empty());
    }

    #[test]
    fn push_scissor_stacks_previous_on_second_push() {
        let r1 = WgpuScissorRect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };
        let r2 = WgpuScissorRect {
            x: 20,
            y: 20,
            width: 60,
            height: 60,
        };
        let mut current: Option<WgpuScissorRect> = None;
        let mut stack: Vec<WgpuScissorRect> = Vec::new();
        push_scissor(&mut current, &mut stack, r1);
        push_scissor(&mut current, &mut stack, r2);
        assert_eq!(current, Some(r2));
        assert_eq!(stack.len(), 1);
        assert_eq!(stack[0], r1);
    }

    // wgpu_scissor_pass_dimensions

    #[test]
    fn wgpu_scissor_pass_dimensions_passes_through_positive_extent() {
        let rect = WgpuScissorRect {
            x: 10,
            y: 20,
            width: 100,
            height: 50,
        };
        assert_eq!(wgpu_scissor_pass_dimensions(&rect), [10, 20, 100, 50]);
    }

    #[test]
    fn wgpu_scissor_pass_dimensions_clamps_extent_to_one() {
        let rect = WgpuScissorRect {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        };
        assert_eq!(wgpu_scissor_pass_dimensions(&rect), [0, 0, 1, 1]);
    }
}
