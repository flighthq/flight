//! wgpu rectangular clipping — scissor-rect push/pop.

use flighthq_types::geometry::Matrix;

use crate::render_state::{WgpuRenderState, WgpuScissorRect};
use crate::sprite_batch::flush_wgpu_sprite_batch;

/// A node's rectangular clip in local coordinates. The scene walk projects it
/// through the node's resolved 2D transform and pushes the resulting scissor for
/// the node and its subtree, popping when the subtree ends. Resolved by the
/// walk's `get_clip_rectangle` closure for nodes whose proxy begins a clip layer.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WgpuClipRectangle {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Pops the most recently pushed clip rectangle from the scissor stack and
/// restores the previous scissor state.
pub fn pop_wgpu_clip_rectangle(state: &mut WgpuRenderState) {
    flush_wgpu_sprite_batch(state);
    state.runtime.scissor_stack.pop();
    let previous = state.runtime.scissor_stack.last().copied();
    state.runtime.current_scissor_rect = previous;

    let (vw, vh) = current_wgpu_viewport(state);
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    match previous {
        None => pass.set_scissor_rect(0, 0, vw, vh),
        Some(rect) if rect.width == 0 || rect.height == 0 => pass.set_scissor_rect(0, 0, 1, 1),
        Some(rect) => pass.set_scissor_rect(rect.x, rect.y, rect.width, rect.height),
    }
}

/// Pushes a scissor rectangle derived from `rect` × `transform` onto the
/// scissor stack, intersecting with the current scissor rect.
pub fn push_wgpu_clip_rectangle(
    state: &mut WgpuRenderState,
    rect_x: f32,
    rect_y: f32,
    rect_width: f32,
    rect_height: f32,
    transform: &Matrix,
) {
    flush_wgpu_sprite_batch(state);
    let (vw, vh) = current_wgpu_viewport(state);
    let computed =
        compute_wgpu_scissor_rect(rect_x, rect_y, rect_width, rect_height, transform, vw, vh);
    let next = intersect_wgpu_scissor_rect(state.runtime.current_scissor_rect, computed);
    state.runtime.current_scissor_rect = Some(next);
    state.runtime.scissor_stack.push(next);

    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    if next.width == 0 || next.height == 0 {
        pass.set_scissor_rect(0, 0, 1, 1);
    } else {
        pass.set_scissor_rect(next.x, next.y, next.width, next.height);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Projects the four corners of `rect` through `transform`, then clamps the axis-aligned
// bounding box to the viewport. Uses top-left origin (matching wgpu scissor coordinates).
fn compute_wgpu_scissor_rect(
    rx: f32,
    ry: f32,
    rw: f32,
    rh: f32,
    t: &Matrix,
    viewport_width: u32,
    viewport_height: u32,
) -> WgpuScissorRect {
    let corners = [(rx, ry), (rx + rw, ry), (rx, ry + rh), (rx + rw, ry + rh)];
    let mut min_x = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for (cx, cy) in corners {
        let x = t.a * cx + t.c * cy + t.tx;
        let y = t.b * cx + t.d * cy + t.ty;
        min_x = min_x.min(x);
        max_x = max_x.max(x);
        min_y = min_y.min(y);
        max_y = max_y.max(y);
    }
    let vw = viewport_width as f32;
    let vh = viewport_height as f32;
    let min_x = min_x.floor().clamp(0.0, vw);
    let max_x = max_x.ceil().clamp(0.0, vw);
    let min_y = min_y.floor().clamp(0.0, vh);
    let max_y = max_y.ceil().clamp(0.0, vh);
    WgpuScissorRect {
        x: min_x as u32,
        y: min_y as u32,
        width: (max_x - min_x).max(0.0) as u32,
        height: (max_y - min_y).max(0.0) as u32,
    }
}

fn current_wgpu_viewport(state: &WgpuRenderState) -> (u32, u32) {
    match state.runtime.render_target_viewport {
        Some(vp) => (vp.width.max(1), vp.height.max(1)),
        None => (state.surface_width.max(1), state.surface_height.max(1)),
    }
}

fn intersect_wgpu_scissor_rect(a: Option<WgpuScissorRect>, b: WgpuScissorRect) -> WgpuScissorRect {
    let Some(a) = a else { return b };
    let x = a.x.max(b.x);
    let y = a.y.max(b.y);
    let right = (a.x + a.width).min(b.x + b.width);
    let bottom = (a.y + a.height).min(b.y + b.height);
    WgpuScissorRect {
        x,
        y,
        width: right.saturating_sub(x),
        height: bottom.saturating_sub(y),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> Matrix {
        Matrix::default()
    }

    #[test]
    fn compute_scissor_rect_identity_clamps_to_viewport() {
        let r = compute_wgpu_scissor_rect(10.0, 20.0, 30.0, 40.0, &identity(), 800, 600);
        assert_eq!(r.x, 10);
        assert_eq!(r.y, 20);
        assert_eq!(r.width, 30);
        assert_eq!(r.height, 40);
    }

    #[test]
    fn compute_scissor_rect_clamps_negative_origin() {
        let r = compute_wgpu_scissor_rect(-50.0, -50.0, 100.0, 100.0, &identity(), 800, 600);
        assert_eq!(r.x, 0);
        assert_eq!(r.y, 0);
        assert_eq!(r.width, 50);
        assert_eq!(r.height, 50);
    }

    #[test]
    fn intersect_scissor_with_none_returns_b() {
        let b = WgpuScissorRect {
            x: 5,
            y: 5,
            width: 10,
            height: 10,
        };
        assert_eq!(intersect_wgpu_scissor_rect(None, b), b);
    }

    #[test]
    fn intersect_scissor_overlap() {
        let a = WgpuScissorRect {
            x: 0,
            y: 0,
            width: 20,
            height: 20,
        };
        let b = WgpuScissorRect {
            x: 10,
            y: 10,
            width: 20,
            height: 20,
        };
        let i = intersect_wgpu_scissor_rect(Some(a), b);
        assert_eq!(i.x, 10);
        assert_eq!(i.y, 10);
        assert_eq!(i.width, 10);
        assert_eq!(i.height, 10);
    }

    #[test]
    fn intersect_scissor_disjoint_is_empty() {
        let a = WgpuScissorRect {
            x: 0,
            y: 0,
            width: 5,
            height: 5,
        };
        let b = WgpuScissorRect {
            x: 100,
            y: 100,
            width: 5,
            height: 5,
        };
        let i = intersect_wgpu_scissor_rect(Some(a), b);
        assert_eq!(i.width, 0);
        assert_eq!(i.height, 0);
    }
}
