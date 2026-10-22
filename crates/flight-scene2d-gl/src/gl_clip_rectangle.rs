// flight-lint: allow-file(contract-vocabulary) D17 clip helpers drive glow scissor state over thread-bound render-gl state

use flight_geometry::{Matrix, Rectangle};
use flight_render_gl::{GlRenderState, GlScissorRect};
use glow::HasContext;

use crate::gl_quad_batch_writer::{flush_gl_quad_batch_writer, get_gl_viewport_size};

fn compute_scissor_rect(
    state: &GlRenderState,
    rect: &Rectangle,
    transform: &Matrix,
) -> GlScissorRect {
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

    let viewport = state.gl_runtime.borrow().render_target_viewport;
    let (viewport_width, viewport_height) = get_gl_viewport_size(state);
    let min_x = 0.0_f32.max(x0.min(x1).min(x2).min(x3).floor());
    let max_x = viewport_width.min(x0.max(x1).max(x2).max(x3).ceil());
    let min_y = 0.0_f32.max(y0.min(y1).min(y2).min(y3).floor());
    let max_y = viewport_height.min(y0.max(y1).max(y2).max(y3).ceil());

    return GlScissorRect {
        height: (max_y - min_y).max(0.0) as i32,
        width: (max_x - min_x).max(0.0) as i32,
        x: viewport.map_or(0, |value| value.x) + min_x as i32,
        y: viewport.map_or(0, |value| value.y) + (viewport_height - max_y).max(0.0) as i32,
    };
}

fn intersect_scissor_rect(a: Option<&GlScissorRect>, b: &GlScissorRect) -> GlScissorRect {
    let Some(a) = a else {
        return *b;
    };

    let x = a.x.max(b.x);
    let y = a.y.max(b.y);
    let right = (a.x + a.width).min(b.x + b.width);
    let bottom = (a.y + a.height).min(b.y + b.height);

    return GlScissorRect {
        height: (bottom - y).max(0),
        width: (right - x).max(0),
        x,
        y,
    };
}

pub fn pop_gl_clip_rectangle(state: &mut GlRenderState) {
    let previous = {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.scissor_stack.pop();
        let previous = runtime.scissor_stack.last().copied();
        runtime.current_scissor_rect = previous;
        previous
    };
    flush_gl_quad_batch_writer(state);

    let gl = &state.gl;
    // SAFETY: scissor state changes occur on the owning GL thread.
    unsafe {
        match previous {
            None => gl.disable(glow::SCISSOR_TEST),
            Some(previous) => gl.scissor(previous.x, previous.y, previous.width, previous.height),
        }
    }
}

pub fn push_gl_clip_rectangle(state: &mut GlRenderState, rect: &Rectangle, transform: &Matrix) {
    let computed = compute_scissor_rect(state, rect, transform);
    let next = {
        let mut runtime = state.gl_runtime.borrow_mut();
        let next = intersect_scissor_rect(runtime.current_scissor_rect.as_ref(), &computed);
        runtime.current_scissor_rect = Some(next);
        runtime.scissor_stack.push(next);
        next
    };
    flush_gl_quad_batch_writer(state);

    let gl = &state.gl;
    // SAFETY: scissor state changes occur on the owning GL thread.
    unsafe {
        gl.enable(glow::SCISSOR_TEST);
        gl.scissor(next.x, next.y, next.width, next.height);
    }
}
