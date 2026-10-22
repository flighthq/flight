// flight-lint: allow-file(contract-vocabulary) D17 clip helpers drive glow stencil state over thread-bound render-gl state

use flight_entity::throw_error;
use flight_geometry::Matrix;
use flight_path::PathWinding;
use flight_render_gl::{GlBoundShader, GlRenderState, create_gl_program};
use glow::HasContext;

use crate::gl_quad_batch_writer::{flush_gl_quad_batch_writer, get_gl_viewport_size, gl_f32_bytes};
use crate::scene2d_gl_runtime::ensure_scene2d_gl_context_runtime;
use crate::types::GlClipProgram;

// Stencil-then-cover fill of arbitrary flattened contours, used to realize a *path* ClipRegion
// exactly (crisp at any zoom — the contours are transformed in the vertex shader each frame, never
// cached as a texture). This is the contour counterpart to the rectangle clip's scissor.
//
// MODEL: a single-level contour clip gates content to the polygon's covered pixels. PHASE 1
// accumulates the winding into the stencil with color off (non-zero: front/back INCR/DECR_WRAP;
// even-odd: INVERT); PHASE 2 enables color and sets the stencil test so only covered pixels pass.
// current_mask_depth tracks whether the gate is live and triggers a stencil clear when a sibling clip
// opens at depth 0. Nested contour clips share one stencil buffer and are not re-derived on pop.

// Position-only program: transform contour points (clip-local) by the node world transform, then by
// the backend's pixels->clip projection. Fragment writes nothing — color is masked off.
const VERTEX_SOURCE: &str = "
attribute vec2 a_position;
uniform mat3 u_worldMatrix;   // node world transform2D (a,b,c,d,tx,ty) lifted to mat3
uniform mat3 u_projection;    // device pixels -> clip space (same one the sprite/shape shaders use)
void main() {
  vec3 clip = u_projection * (u_worldMatrix * vec3(a_position, 1.0));
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
";

const FRAGMENT_SOURCE: &str = "
precision mediump float;
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); }
";

// flight-lint: allow(f64) clip contours are the exact f64 coordinate arrays flight-clip stores
fn draw_clip_contours(state: &GlRenderState, program: &GlClipProgram, contours: &[Vec<f64>]) {
    let gl = &state.gl;
    // SAFETY: the clip buffer belongs to this context; uploads and draws occur on the GL thread.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(program.buffer));
        gl.enable_vertex_attrib_array(program.position_location);
        gl.vertex_attrib_pointer_f32(program.position_location, 2, glow::FLOAT, false, 0, 0);
        for contour in contours {
            if contour.len() < 6 {
                continue;
            }
            let points = contour.iter().map(|value| *value as f32).collect::<Vec<_>>();
            gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, gl_f32_bytes(&points), glow::STREAM_DRAW);
            // TRIANGLE_FAN fills the (possibly concave) polygon into the stencil; the winding op
            // handles correctness.
            gl.draw_arrays(glow::TRIANGLE_FAN, 0, (contour.len() >> 1) as i32);
        }
    }
}

fn ensure_clip_program(state: &GlRenderState) -> GlClipProgram {
    if let Some(program) = &ensure_scene2d_gl_context_runtime(state).clip_program {
        return program.clone();
    }
    let gl = &state.gl;
    let program = create_gl_program(gl, VERTEX_SOURCE, FRAGMENT_SOURCE, Some("Clip-contours"))
        .unwrap_or_else(|error| throw_error(&error));
    // SAFETY: allocation and location queries occur on the GL thread for this context's program.
    let clip_program = unsafe {
        GlClipProgram {
            program,
            buffer: gl
                .create_buffer()
                .unwrap_or_else(|error| throw_error(&format!("pushGlClipContours: {error}"))),
            position_location: gl.get_attrib_location(program, "a_position").unwrap_or(0),
            world_matrix_location: gl.get_uniform_location(program, "u_worldMatrix"),
            projection_location: gl.get_uniform_location(program, "u_projection"),
        }
    };
    ensure_scene2d_gl_context_runtime(state).clip_program = Some(clip_program.clone());
    return clip_program;
}

// Device pixels -> clip space for the current viewport / render target: the same column-major mat3
// the sprite/shape batch builds, so a clip's contours and the content it clips land in identical
// clip space.
fn get_projection_mat3(state: &GlRenderState) -> [f32; 9] {
    let (width, height) = get_gl_viewport_size(state);
    let w = if width == 0.0 { 1.0 } else { width };
    let h = if height == 0.0 { 1.0 } else { height };
    return [2.0 / w, 0.0, 0.0, 0.0, -2.0 / h, 0.0, -1.0, 1.0, 1.0];
}

pub fn pop_gl_clip_contours(state: &mut GlRenderState) {
    flush_gl_quad_batch_writer(state);
    let next_depth = {
        let mut runtime = state.gl_runtime.borrow_mut();
        let next_depth = runtime.current_mask_depth.saturating_sub(1);
        runtime.current_mask_depth = next_depth;
        next_depth
    };
    // Single-level contour clips are the common case; the outermost pop turns the stencil gate off.
    if next_depth == 0 {
        // SAFETY: stencil state changes occur on the owning GL thread.
        unsafe {
            state.gl.disable(glow::STENCIL_TEST);
            state.gl.stencil_mask(0xff);
        }
    }
}

// flight-lint: allow(f64) clip contours are the exact f64 coordinate arrays flight-clip stores; the upload narrows them as the source's Float32Array does
pub fn push_gl_clip_contours(
    state: &mut GlRenderState,
    contours: &[Vec<f64>],
    winding: PathWinding,
    world_transform: &Matrix,
) {
    flush_gl_quad_batch_writer(state);
    let depth = state.gl_runtime.borrow().current_mask_depth;
    let gl = std::rc::Rc::clone(&state.gl);

    // SAFETY: stencil state changes occur on the owning GL thread.
    unsafe {
        if depth == 0 {
            gl.enable(glow::STENCIL_TEST);
            gl.stencil_mask(0xff);
            gl.clear(glow::STENCIL_BUFFER_BIT);
        }
    }

    let program = ensure_clip_program(state);
    // SAFETY: the clip program belongs to this context and binding occurs on the GL thread.
    unsafe { gl.use_program(Some(program.program)) };
    // Content draws skip use_program when the current shader already matches their program. Record
    // the clip program here so the next content draw detects the change and re-binds.
    state.context_state.runtime_state.borrow_mut().binding = Some(GlBoundShader {
        locations: None,
        program: program.program,
    });
    upload_clip_uniforms(state, &program, world_transform);

    // SAFETY: stencil configuration and the contour draws occur on the owning GL thread.
    unsafe {
        // PHASE 1 — accumulate the polygon's winding into the stencil with color writes off.
        gl.color_mask(false, false, false, false);
        gl.stencil_mask(0xff);
        gl.disable(glow::CULL_FACE);

        if winding == PathWinding::EvenOdd {
            gl.stencil_func(glow::ALWAYS, 0, 0xff);
            gl.stencil_op(glow::KEEP, glow::KEEP, glow::INVERT);
        } else {
            gl.stencil_func(glow::ALWAYS, 0, 0xff);
            gl.stencil_op_separate(glow::FRONT, glow::KEEP, glow::KEEP, glow::INCR_WRAP);
            gl.stencil_op_separate(glow::BACK, glow::KEEP, glow::KEEP, glow::DECR_WRAP);
        }
    }
    draw_clip_contours(state, &program, contours);

    // SAFETY: stencil configuration occurs on the owning GL thread.
    unsafe {
        // PHASE 2 — enable color and gate subsequent content to the covered pixels.
        gl.color_mask(true, true, true, true);
        gl.stencil_mask(0x00);
        if winding == PathWinding::EvenOdd {
            gl.stencil_func(glow::EQUAL, 0x1, 0x1);
        } else {
            gl.stencil_func(glow::NOTEQUAL, 0x0, 0xff);
        }
        gl.stencil_op(glow::KEEP, glow::KEEP, glow::KEEP);
    }
    state.gl_runtime.borrow_mut().current_mask_depth = depth + 1;
}

fn upload_clip_uniforms(state: &GlRenderState, program: &GlClipProgram, m: &Matrix) {
    let projection = get_projection_mat3(state);
    // SAFETY: the locations belong to the bound clip program on this GL thread.
    unsafe {
        // mat3 column-major from Matrix(a,b,c,d,tx,ty).
        state.gl.uniform_matrix_3_f32_slice(
            program.world_matrix_location.as_ref(),
            false,
            &[m.a, m.b, 0.0, m.c, m.d, 0.0, m.tx, m.ty, 1.0],
        );
        state.gl.uniform_matrix_3_f32_slice(
            program.projection_location.as_ref(),
            false,
            &projection,
        );
    }
}
