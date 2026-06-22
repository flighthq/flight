//! GL clip support — scissor (rect) and stencil-then-cover (contour) clipping.

use glow::HasContext;

use crate::sprite_batch::flush_gl_sprite_batch;
use flighthq_render_gl::viewport_dimensions;
use flighthq_render_gl::{GlClipForm, GlRenderState, GlScissorRect};

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Installs the unified GL clip hooks on `state`, enabling both scissor
/// (rect-form) and stencil-contour (path-form) clipping.
///
/// The Rust render path calls the push/pop functions directly; enabling support
/// resets the scissor stack and clip-form tracking to a clean state.
pub fn enable_gl_clip_support(state: &mut GlRenderState) {
    state.runtime.scissor_stack.clear();
    state.runtime.clip_forms.clear();
    state.runtime.current_scissor_rect = None;
}

/// Pops the most recently pushed stencil-contour clip layer.
pub fn pop_gl_clip_contours(state: &mut GlRenderState) {
    if state.runtime.clip_forms.last() != Some(&GlClipForm::Contour) {
        return;
    }
    state.runtime.clip_forms.pop();
    flush_gl_sprite_batch(state);
    state.runtime.current_mask_depth = state.runtime.current_mask_depth.saturating_sub(1);
    unsafe {
        if state.runtime.current_mask_depth == 0 {
            state.gl.disable(glow::STENCIL_TEST);
        } else {
            state
                .gl
                .stencil_func(glow::EQUAL, state.runtime.current_mask_depth as i32, 0xff);
        }
    }
}

/// Pops the most recently pushed clip rectangle and restores the previous
/// scissor state.
pub fn pop_gl_clip_rectangle(state: &mut GlRenderState) {
    state.runtime.scissor_stack.pop();
    if state.runtime.clip_forms.last() == Some(&GlClipForm::Rect) {
        state.runtime.clip_forms.pop();
    }
    let previous = state.runtime.scissor_stack.last().copied();
    state.runtime.current_scissor_rect = previous;
    flush_gl_sprite_batch(state);
    unsafe {
        match previous {
            None => state.gl.disable(glow::SCISSOR_TEST),
            Some(r) => state.gl.scissor(r.x, r.y, r.width, r.height),
        }
    }
}

/// Pushes a stencil-contour clip region defined by `contours` × `transform`.
///
/// Increments the stencil depth and configures the stencil test so subsequent
/// draws are masked to the union of the contour fills. The contour fill geometry
/// is uploaded by the clip mesh path; here the stencil state is configured.
pub fn push_gl_clip_contours(
    state: &mut GlRenderState,
    contours: &[Vec<[f32; 2]>],
    winding: GlWindingRule,
    transform: &flighthq_types::geometry::Matrix,
) {
    let _ = (contours, winding, transform);
    flush_gl_sprite_batch(state);
    state.runtime.current_mask_depth += 1;
    state.runtime.clip_forms.push(GlClipForm::Contour);
    unsafe {
        state.gl.enable(glow::STENCIL_TEST);
        state
            .gl
            .stencil_func(glow::EQUAL, state.runtime.current_mask_depth as i32, 0xff);
        state.gl.stencil_op(glow::KEEP, glow::KEEP, glow::KEEP);
    }
}

/// Pushes a scissor rectangle derived from `rect` × `transform` onto the
/// scissor stack, intersecting with the current scissor rect.
pub fn push_gl_clip_rectangle(
    state: &mut GlRenderState,
    rect_x: f32,
    rect_y: f32,
    rect_width: f32,
    rect_height: f32,
    transform: &flighthq_types::geometry::Matrix,
) {
    let (vw, vh) = viewport_dimensions(state);
    let candidate =
        compute_gl_scissor_rect(rect_x, rect_y, rect_width, rect_height, transform, vw, vh);
    let next = intersect_gl_scissor_rect(state.runtime.current_scissor_rect, candidate);
    state.runtime.current_scissor_rect = Some(next);
    state.runtime.scissor_stack.push(next);
    state.runtime.clip_forms.push(GlClipForm::Rect);
    flush_gl_sprite_batch(state);
    unsafe {
        state.gl.enable(glow::SCISSOR_TEST);
        state.gl.scissor(next.x, next.y, next.width, next.height);
    }
}

/// Fill rule for stencil-contour clip regions.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default)]
pub enum GlWindingRule {
    #[default]
    NonZero,
    EvenOdd,
}

// ---------------------------------------------------------------------------
// Pure-CPU scissor math — the testable seams.
// ---------------------------------------------------------------------------

/// Transforms `rect` by `transform`, clamps the result to the viewport, and
/// converts it into a GL window-coordinate (Y-up) scissor rect. Pure CPU.
pub fn compute_gl_scissor_rect(
    rect_x: f32,
    rect_y: f32,
    rect_width: f32,
    rect_height: f32,
    transform: &flighthq_types::geometry::Matrix,
    viewport_width: u32,
    viewport_height: u32,
) -> GlScissorRect {
    let t = transform;
    let corners = [
        (rect_x, rect_y),
        (rect_x + rect_width, rect_y),
        (rect_x, rect_y + rect_height),
        (rect_x + rect_width, rect_y + rect_height),
    ];
    let mut min_x = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for (px, py) in corners {
        let x = t.a * px + t.c * py + t.tx;
        let y = t.b * px + t.d * py + t.ty;
        min_x = min_x.min(x);
        max_x = max_x.max(x);
        min_y = min_y.min(y);
        max_y = max_y.max(y);
    }
    let vw = viewport_width as f32;
    let vh = viewport_height as f32;
    let min_x = min_x.floor().max(0.0).min(vw);
    let max_x = max_x.ceil().max(0.0).min(vw);
    let min_y = min_y.floor().max(0.0).min(vh);
    let max_y = max_y.ceil().max(0.0).min(vh);
    GlScissorRect {
        x: min_x as i32,
        // GL scissor origin is bottom-left; flip Y.
        y: (vh - max_y).max(0.0) as i32,
        width: (max_x - min_x).max(0.0) as i32,
        height: (max_y - min_y).max(0.0) as i32,
    }
}

/// Intersects two scissor rects, returning the overlap (empty if disjoint).
/// `a` of `None` means no prior clip, so `b` passes through. Pure CPU.
pub fn intersect_gl_scissor_rect(a: Option<GlScissorRect>, b: GlScissorRect) -> GlScissorRect {
    let a = match a {
        Some(a) => a,
        None => return b,
    };
    let x = a.x.max(b.x);
    let y = a.y.max(b.y);
    let right = (a.x + a.width).min(b.x + b.width);
    let bottom = (a.y + a.height).min(b.y + b.height);
    GlScissorRect {
        x,
        y,
        width: (right - x).max(0),
        height: (bottom - y).max(0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::geometry::Matrix;

    // compute_gl_scissor_rect

    #[test]
    fn compute_gl_scissor_rect_identity_flips_y() {
        let m = Matrix::default();
        let r = compute_gl_scissor_rect(10.0, 20.0, 30.0, 40.0, &m, 200, 100);
        assert_eq!(r.x, 10);
        assert_eq!(r.width, 30);
        assert_eq!(r.height, 40);
        // y = viewport_height - max_y = 100 - 60 = 40.
        assert_eq!(r.y, 40);
    }

    #[test]
    fn compute_gl_scissor_rect_clamps_to_viewport() {
        let m = Matrix::default();
        let r = compute_gl_scissor_rect(-50.0, -50.0, 1000.0, 1000.0, &m, 200, 100);
        assert_eq!(r.x, 0);
        assert_eq!(r.y, 0);
        assert_eq!(r.width, 200);
        assert_eq!(r.height, 100);
    }

    // intersect_gl_scissor_rect

    #[test]
    fn intersect_gl_scissor_rect_none_passes_through() {
        let b = GlScissorRect {
            x: 5,
            y: 5,
            width: 10,
            height: 10,
        };
        let out = intersect_gl_scissor_rect(None, b);
        assert_eq!(out.x, 5);
        assert_eq!(out.width, 10);
    }

    #[test]
    fn intersect_gl_scissor_rect_overlap() {
        let a = GlScissorRect {
            x: 0,
            y: 0,
            width: 20,
            height: 20,
        };
        let b = GlScissorRect {
            x: 10,
            y: 10,
            width: 20,
            height: 20,
        };
        let out = intersect_gl_scissor_rect(Some(a), b);
        assert_eq!(out.x, 10);
        assert_eq!(out.y, 10);
        assert_eq!(out.width, 10);
        assert_eq!(out.height, 10);
    }

    #[test]
    fn intersect_gl_scissor_rect_disjoint_is_empty() {
        let a = GlScissorRect {
            x: 0,
            y: 0,
            width: 5,
            height: 5,
        };
        let b = GlScissorRect {
            x: 100,
            y: 100,
            width: 5,
            height: 5,
        };
        let out = intersect_gl_scissor_rect(Some(a), b);
        assert_eq!(out.width, 0);
        assert_eq!(out.height, 0);
    }
}
