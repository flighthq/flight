//! GL velocity renderer — writes per-node motion velocity into an `rgba16f`
//! velocity target for motion-blur and similar effects.
//!
//! Velocity is tied to the draw, so production is per-kind: the velocity pass
//! walks the scene and dispatches a registered [`GlVelocityWriter`] for each
//! node's kind, which draws that kind's velocity into the bound `rgba16f`
//! target. Mirrors the TS `glVelocity` module and the wgpu velocity renderer.
//!
//! ENCODING: velocity is written in device pixels per frame (node-unit velocity
//! × pixelRatio), y-down, into R/G of an `rgba16f` target (signed, sub-pixel).
//! B is reserved; A=1 marks a covered texel so consumers distinguish it from the
//! cleared (0,0,0,0) zero-velocity background. World bounds are device-pixel,
//! top-left origin, y-down; [`draw_gl_velocity_quad`] maps a rect into clip
//! space, flipping y.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use glow::HasContext;

use flighthq_types::kind::KindId;

use crate::sprite_batch::submit_gl_node_atlas_quad;
use flighthq_render_gl::{GlRenderState, GlRenderTarget, GlRenderTargetFormat};
use flighthq_render_gl::{create_gl_render_target, viewport_dimensions};

/// A velocity writer: draws one node kind's velocity into the bound `rgba16f`
/// target. The default writer for plain display objects covers the node's world
/// bounds with its (single) velocity; batched kinds register their own to emit
/// per-instance velocity. Mirrors the TS `GlVelocityWriter`.
///
/// The writer receives the render state (the velocity program must be current,
/// which [`render_gl_velocity`] sets up) and the node's render-proxy id.
pub type GlVelocityWriter = fn(state: &mut GlRenderState, render_proxy_id: u64);

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Allocates an `rgba16f` render target sized to hold a signed, sub-pixel
/// screen-space velocity buffer.
pub fn create_gl_velocity_target(
    state: &mut GlRenderState,
    width: u32,
    height: u32,
) -> GlRenderTarget {
    create_gl_render_target(state, width, height, GlRenderTargetFormat::Rgba16F, 1)
}

/// Draws a velocity-blurred sprite render proxy by submitting the node's quad
/// into the sprite batch (Rust-local helper; not part of the TS API surface).
pub fn draw_gl_velocity(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

/// Draws one velocity quad: a device-pixel rect `(x, y, width, height)` filled
/// with `(velocity_x, velocity_y)` in node units (scaled by pixelRatio here).
///
/// The velocity program must be current — [`render_gl_velocity`] sets it up
/// before dispatching writers. Writers call this once per covered region (once
/// for a display object's bounds; once per instance for a batch). No-op when the
/// velocity program is not built yet (outside a velocity pass).
#[allow(clippy::too_many_arguments)]
pub fn draw_gl_velocity_quad(
    state: &mut GlRenderState,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    velocity_x: f32,
    velocity_y: f32,
) {
    let program = match velocity_program(state) {
        Some(program) => program,
        None => return,
    };
    let (vw, vh) = viewport_dimensions(state);
    let vw = vw.max(1) as f32;
    let vh = vh.max(1) as f32;
    let pixel_ratio = state.render_state.pixel_ratio;

    let clip_x0 = (x / vw) * 2.0 - 1.0;
    let clip_y0 = 1.0 - (y / vh) * 2.0;
    let clip_width = (width / vw) * 2.0;
    let clip_height = -((height / vh) * 2.0);

    unsafe {
        state.gl.uniform_4_f32(
            program.loc_clip_rect.as_ref(),
            clip_x0,
            clip_y0,
            clip_width,
            clip_height,
        );
        state.gl.uniform_2_f32(
            program.loc_velocity.as_ref(),
            velocity_x * pixel_ratio,
            velocity_y * pixel_ratio,
        );
        state.gl.draw_arrays(glow::TRIANGLES, 0, 6);
    }
}

/// Returns the velocity writer registered for `kind`, or `None`.
pub fn get_gl_velocity_writer(_state: &GlRenderState, kind: KindId) -> Option<GlVelocityWriter> {
    velocity_writers()
        .lock()
        .expect("writer lock")
        .get(&kind)
        .copied()
}

/// Registers a velocity writer for `kind`.
pub fn register_gl_velocity_writer(
    _state: &mut GlRenderState,
    kind: KindId,
    writer: GlVelocityWriter,
) {
    velocity_writers()
        .lock()
        .expect("writer lock")
        .insert(kind, writer);
}

/// Walks `root_id`'s subtree and writes every moving renderable's velocity into
/// `target`, dispatching the registered [`GlVelocityWriter`] for each node's
/// kind. Nodes whose kind has no writer are skipped; the cleared (0,0,0,0)
/// background means zero velocity. Restores the previously bound framebuffer.
///
/// `get_children`/`get_kind` supply the graph topology and per-node kind the
/// id-based writer cannot read directly (mirrors `render_gl_display_object`).
pub fn render_gl_velocity(
    state: &mut GlRenderState,
    root_id: u64,
    target: &GlRenderTarget,
    get_children: &dyn Fn(u64) -> Vec<u64>,
    get_kind: &dyn Fn(u64) -> KindId,
) {
    let program = match velocity_program(state) {
        Some(program) => program,
        None => return,
    };

    let prior_framebuffer = state.runtime.current_framebuffer;
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, Some(target.framebuffer));
        state
            .gl
            .viewport(0, 0, target.width as i32, target.height as i32);
        state.gl.disable(glow::BLEND);
        state.gl.clear_color(0.0, 0.0, 0.0, 0.0);
        state.gl.clear(glow::COLOR_BUFFER_BIT);

        state.gl.use_program(Some(program.program));
        state
            .gl
            .bind_buffer(glow::ARRAY_BUFFER, Some(program.quad_buffer));
        state.gl.enable_vertex_attrib_array(program.loc_corner);
        state
            .gl
            .vertex_attrib_pointer_f32(program.loc_corner, 2, glow::FLOAT, false, 0, 0);
    }
    state.runtime.current_framebuffer = Some(target.framebuffer);

    // Pre-order walk; dispatch the writer registered for each node's kind.
    let mut stack: Vec<u64> = vec![root_id];
    while let Some(current) = stack.pop() {
        let kind = get_kind(current);
        if let Some(writer) = get_gl_velocity_writer(state, kind) {
            writer(state, current);
        }
        for child in get_children(current).into_iter().rev() {
            stack.push(child);
        }
    }

    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, prior_framebuffer);
        state.gl.disable_vertex_attrib_array(program.loc_corner);
    }
    state.runtime.current_framebuffer = prior_framebuffer;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Compiled velocity program (per GL context). The unit-quad corners live in
// `quad_buffer`; the covered rect and velocity are uploaded per quad.
#[derive(Clone)]
struct GlVelocityProgram {
    program: glow::Program,
    quad_buffer: glow::Buffer,
    loc_corner: u32,
    loc_clip_rect: Option<glow::UniformLocation>,
    loc_velocity: Option<glow::UniformLocation>,
}

// Returns the velocity program, compiling it once for the current GL context.
// Cached in a process-wide slot keyed on nothing: one GL context per thread is
// the norm, matching how the crate's other lazily-compiled programs are held.
fn velocity_program(state: &mut GlRenderState) -> Option<GlVelocityProgram> {
    {
        let cached = velocity_program_slot().lock().expect("program lock");
        if cached.is_some() {
            return cached.clone();
        }
    }
    let program = compile_velocity_program(state);
    let mut slot = velocity_program_slot().lock().expect("program lock");
    *slot = Some(program);
    slot.clone()
}

fn compile_velocity_program(state: &GlRenderState) -> GlVelocityProgram {
    let gl = &state.gl;
    unsafe {
        let vs = compile_velocity_shader(gl, glow::VERTEX_SHADER, VELOCITY_VERTEX_SRC);
        let fs = compile_velocity_shader(gl, glow::FRAGMENT_SHADER, VELOCITY_FRAGMENT_SRC);
        let program = gl.create_program().expect("create velocity program");
        gl.attach_shader(program, vs);
        gl.attach_shader(program, fs);
        gl.link_program(program);
        gl.delete_shader(vs);
        gl.delete_shader(fs);

        let quad_buffer = gl.create_buffer().expect("create velocity quad buffer");
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(quad_buffer));
        let corners: [f32; 12] = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0];
        gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            std::slice::from_raw_parts(corners.as_ptr() as *const u8, 48),
            glow::STATIC_DRAW,
        );

        GlVelocityProgram {
            loc_corner: gl.get_attrib_location(program, "a_corner").unwrap_or(0),
            loc_clip_rect: gl.get_uniform_location(program, "u_clipRect"),
            loc_velocity: gl.get_uniform_location(program, "u_velocity"),
            program,
            quad_buffer,
        }
    }
}

// SAFETY: called only inside an `unsafe` block that owns a live GL context.
unsafe fn compile_velocity_shader(gl: &glow::Context, kind: u32, src: &str) -> glow::Shader {
    let shader = unsafe { gl.create_shader(kind).expect("create velocity shader") };
    unsafe {
        gl.shader_source(shader, src);
        gl.compile_shader(shader);
    }
    shader
}

// Process-wide velocity-writer registry. Empty until `register_gl_velocity_writer`
// installs one; lazily constructed so there is no side effect at module load.
fn velocity_writers() -> &'static Mutex<HashMap<KindId, GlVelocityWriter>> {
    static WRITERS: OnceLock<Mutex<HashMap<KindId, GlVelocityWriter>>> = OnceLock::new();
    WRITERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn velocity_program_slot() -> &'static Mutex<Option<GlVelocityProgram>> {
    static SLOT: OnceLock<Mutex<Option<GlVelocityProgram>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

// u_clipRect = (clipX0, clipY0, clipWidth, clipHeight). a_corner is the unit-quad
// corner [0..1]; the covered rect is reconstructed per vertex so no per-node
// matrix upload is needed.
const VELOCITY_VERTEX_SRC: &str = "#version 300 es
in vec2 a_corner;
uniform vec4 u_clipRect;
void main() {
  vec2 clip = u_clipRect.xy + a_corner * u_clipRect.zw;
  gl_Position = vec4(clip, 0.0, 1.0);
}";

const VELOCITY_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
uniform vec2 u_velocity;
out vec4 fragColor;
void main() {
  fragColor = vec4(u_velocity, 0.0, 1.0);
}";

#[cfg(test)]
mod tests {
    use super::*;

    // VELOCITY_VERTEX_SRC / VELOCITY_FRAGMENT_SRC

    #[test]
    fn velocity_shaders_declare_uniforms_and_stages() {
        assert!(VELOCITY_VERTEX_SRC.contains("uniform vec4 u_clipRect"));
        assert!(VELOCITY_VERTEX_SRC.contains("in vec2 a_corner"));
        assert!(VELOCITY_FRAGMENT_SRC.contains("uniform vec2 u_velocity"));
        assert!(VELOCITY_FRAGMENT_SRC.contains("fragColor = vec4(u_velocity, 0.0, 1.0)"));
    }
}
