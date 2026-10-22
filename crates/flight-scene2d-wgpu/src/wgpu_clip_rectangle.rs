// flight-lint: allow-file(contract-vocabulary) D17 clip helpers drive wgpu scissor state over render-wgpu state
//! Rectangle clips realized as nested scissor rectangles (TS `wgpuClipRectangle.ts`).

use flight_geometry::{Matrix, Rectangle};
use flight_render_wgpu::{
    WgpuRenderState, WgpuScissorRect, get_wgpu_render_pass_viewport, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut, set_wgpu_render_pass_scissor_rect,
};

use crate::wgpu_quad_batch_writer::flush_wgpu_quad_batch_writer;

fn compute_wgpu_scissor_rect(
    state: &WgpuRenderState,
    rect: &Rectangle,
    transform: &Matrix,
) -> WgpuScissorRect {
    let x0 = transform.a * rect.x + transform.c * rect.y + transform.tx;
    let y0 = transform.b * rect.x + transform.d * rect.y + transform.ty;
    let x1 = transform.a * (rect.x + rect.width) + transform.c * rect.y + transform.tx;
    let y1 = transform.b * (rect.x + rect.width) + transform.d * rect.y + transform.ty;
    let x2 = transform.a * rect.x + transform.c * (rect.y + rect.height) + transform.tx;
    let y2 = transform.b * rect.x + transform.d * (rect.y + rect.height) + transform.ty;
    let x3 =
        transform.a * (rect.x + rect.width) + transform.c * (rect.y + rect.height) + transform.tx;
    let y3 =
        transform.b * (rect.x + rect.width) + transform.d * (rect.y + rect.height) + transform.ty;

    let viewport = get_wgpu_render_pass_viewport(state);
    let min_x = 0.0_f32.max(x0.min(x1).min(x2).min(x3).floor());
    let max_x = viewport.width.min(x0.max(x1).max(x2).max(x3).ceil());
    let min_y = 0.0_f32.max(y0.min(y1).min(y2).min(y3).floor());
    let max_y = viewport.height.min(y0.max(y1).max(y2).max(y3).ceil());

    // The scissor uses a top-left origin, the same as the canvas coordinate system.
    return WgpuScissorRect {
        height: 0.0_f32.max(max_y - min_y),
        width: 0.0_f32.max(max_x - min_x),
        x: min_x,
        y: min_y,
    };
}

fn intersect_wgpu_scissor_rect(
    a: Option<&WgpuScissorRect>,
    b: &WgpuScissorRect,
) -> WgpuScissorRect {
    let Some(a) = a else {
        return *b;
    };
    let x = a.x.max(b.x);
    let y = a.y.max(b.y);
    let right = (a.x + a.width).min(b.x + b.width);
    let bottom = (a.y + a.height).min(b.y + b.height);
    return WgpuScissorRect {
        height: 0.0_f32.max(bottom - y),
        width: 0.0_f32.max(right - x),
        x,
        y,
    };
}

/// Pops the innermost rectangle clip, restoring the enclosing scissor (TS `popWgpuClipRectangle`).
pub fn pop_wgpu_clip_rectangle(state: &mut WgpuRenderState) {
    flush_wgpu_quad_batch_writer(state);
    let runtime = get_wgpu_render_state_runtime_mut(state);
    runtime.scissor_stack.pop();
    let previous = runtime.scissor_stack.last().copied();
    runtime.current_scissor_rect = previous;

    if runtime.render_pass.is_none() {
        return;
    }

    match previous {
        None => {
            let viewport = get_wgpu_render_pass_viewport(state);
            set_wgpu_render_pass_scissor_rect(
                state,
                0,
                0,
                viewport.width as u32,
                viewport.height as u32,
            );
        }
        // Empty intersection stored during push — maintain the degenerate scissor until fully
        // popped.
        Some(previous) if previous.width <= 0.0 || previous.height <= 0.0 => {
            set_wgpu_render_pass_scissor_rect(state, 0, 0, 1, 1);
        }
        Some(previous) => {
            set_wgpu_render_pass_scissor_rect(
                state,
                previous.x as u32,
                previous.y as u32,
                previous.width as u32,
                previous.height as u32,
            );
        }
    }
}

/// Pushes a rectangle clip: the transformed rect's pixel bounds, intersected with the enclosing
/// scissor (TS `pushWgpuClipRectangle`).
pub fn push_wgpu_clip_rectangle(state: &mut WgpuRenderState, rect: &Rectangle, transform: &Matrix) {
    flush_wgpu_quad_batch_writer(state);
    let current = get_wgpu_render_state_runtime(state).current_scissor_rect;
    let next = intersect_wgpu_scissor_rect(
        current.as_ref(),
        &compute_wgpu_scissor_rect(state, rect, transform),
    );
    let runtime = get_wgpu_render_state_runtime_mut(state);
    runtime.current_scissor_rect = Some(next);
    runtime.scissor_stack.push(next);

    if runtime.render_pass.is_none() {
        return;
    }
    if next.width <= 0.0 || next.height <= 0.0 {
        // The clip rect projects entirely outside the viewport — use a 1×1 degenerate scissor at
        // the origin so the node is effectively invisible while the rect remains valid.
        set_wgpu_render_pass_scissor_rect(state, 0, 0, 1, 1);
    } else {
        set_wgpu_render_pass_scissor_rect(
            state,
            next.x as u32,
            next.y as u32,
            next.width as u32,
            next.height as u32,
        );
    }
}
