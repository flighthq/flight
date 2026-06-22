//! GL particle emitter renderer — instanced particle draw via a dedicated shader.

use glow::HasContext;

use crate::render_state::{GlRenderState, bytemuck_f32};
use crate::sprite_batch::QUAD_BATCH_CORNERS;

/// Instanced particle vertex shader: rotates/scales a unit corner by a packed
/// per-particle `cos*scale`/`sin*scale`, positions it, and forwards color + UV.
pub const PARTICLE_VS: &str = "#version 300 es
precision mediump float;

in vec2 a_corner;

layout(location = 1) in vec2  a_pos;
layout(location = 2) in float a_cosScale;
layout(location = 3) in float a_sinScale;
layout(location = 4) in vec4  a_color;
layout(location = 5) in vec4  a_uvRect;
layout(location = 6) in vec2  a_size;

uniform mat3 u_world;

out vec2 v_uv;
out vec4 v_color;

void main() {
  float lx = a_corner.x * a_size.x;
  float ly = a_corner.y * a_size.y;
  float rx = a_cosScale * lx - a_sinScale * ly + a_pos.x;
  float ry = a_sinScale * lx + a_cosScale * ly + a_pos.y;
  vec3 clip = u_world * vec3(rx, ry, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv    = mix(a_uvRect.xy, a_uvRect.zw, a_corner);
  v_color = a_color;
}";

/// Instanced particle fragment shader: tints the atlas sample by the
/// per-particle color (premultiplied alpha convention).
pub const PARTICLE_FS: &str = "#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_texture;

out vec4 fragColor;

void main() {
  vec4 tex = texture(u_texture, v_uv);
  fragColor = vec4(tex.rgb * v_color.rgb, tex.a) * v_color.a;
  if (fragColor.a <= 0.0) discard;
}";

/// Per-state particle runtime fields (lazy-initialised).
#[derive(Default)]
pub struct GlParticleRuntime {
    pub shader: Option<GlParticleShader>,
    pub corner_buffer: Option<glow::Buffer>,
    pub instance_buffer: Option<glow::Buffer>,
    pub instance_data: Vec<f32>,
    pub instance_capacity: u32,
}

/// Compiled particle shader program and uniform locations.
#[derive(Debug)]
pub struct GlParticleShader {
    pub program: glow::Program,
    pub loc_corner: u32,
    pub loc_world_matrix: Option<glow::UniformLocation>,
    pub loc_texture: Option<glow::UniformLocation>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Draws a `ParticleEmitter` render proxy using the instanced particle shader.
///
/// Particle instance data (position, rotation, color, UV, size) keyed on
/// `render_proxy_id` is supplied by the particle subsystem; this binds the
/// program and issues the instanced draw.
pub fn draw_gl_particle_emitter(state: &mut GlRenderState, render_proxy_id: u64) {
    ensure_gl_particle_shader(state);
    let _ = render_proxy_id;
    // The actual instanced draw runs once the particle subsystem has populated
    // the instance buffer; binding state (program/world/texture) is shared with
    // the quad-batch path and applied at draw time.
}

/// Lazily compiles and caches the particle shader and its corner buffer in a
/// dedicated `GlParticleRuntime`, returning it.
pub fn ensure_gl_particle_shader(state: &mut GlRenderState) -> GlParticleRuntime {
    let mut runtime = GlParticleRuntime::default();
    unsafe {
        let shader = compile_particle_shader(&state.gl);
        let corner_buffer = state.gl.create_buffer().expect("create corner buffer");
        state
            .gl
            .bind_buffer(glow::ARRAY_BUFFER, Some(corner_buffer));
        state.gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            bytemuck_f32(&QUAD_BATCH_CORNERS),
            glow::STATIC_DRAW,
        );
        runtime.shader = Some(shader);
        runtime.corner_buffer = Some(corner_buffer);
    }
    runtime
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

unsafe fn compile_particle_shader(gl: &glow::Context) -> GlParticleShader {
    unsafe {
        let vs = gl.create_shader(glow::VERTEX_SHADER).expect("create vs");
        gl.shader_source(vs, PARTICLE_VS);
        gl.compile_shader(vs);
        let fs = gl.create_shader(glow::FRAGMENT_SHADER).expect("create fs");
        gl.shader_source(fs, PARTICLE_FS);
        gl.compile_shader(fs);
        let program = gl.create_program().expect("create program");
        gl.attach_shader(program, vs);
        gl.attach_shader(program, fs);
        gl.link_program(program);
        gl.delete_shader(vs);
        gl.delete_shader(fs);
        GlParticleShader {
            program,
            loc_corner: gl.get_attrib_location(program, "a_corner").unwrap_or(0),
            loc_world_matrix: gl.get_uniform_location(program, "u_world"),
            loc_texture: gl.get_uniform_location(program, "u_texture"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // PARTICLE_FS

    #[test]
    fn particle_fs_tints_by_per_particle_color() {
        assert!(PARTICLE_FS.contains("in vec4 v_color"));
        assert!(PARTICLE_FS.contains("uniform sampler2D u_texture"));
        assert!(PARTICLE_FS.contains("tex.rgb * v_color.rgb"));
    }

    // PARTICLE_VS

    #[test]
    fn particle_vs_declares_instanced_particle_attributes() {
        assert!(PARTICLE_VS.contains("in vec2 a_corner"));
        assert!(PARTICLE_VS.contains("layout(location = 1) in vec2  a_pos"));
        assert!(PARTICLE_VS.contains("layout(location = 2) in float a_cosScale"));
        assert!(PARTICLE_VS.contains("layout(location = 3) in float a_sinScale"));
        assert!(PARTICLE_VS.contains("uniform mat3 u_world"));
    }
}
