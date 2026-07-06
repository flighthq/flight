//! GL fullscreen pass — the substrate-level fullscreen-pass primitives.
//!
//! The substrate-level fullscreen-pass infrastructure shared by filter and
//! effect recipes: compile a fragment program against the shared clip-space quad
//! vertex shader, and clear a render target before drawing into it. Filter and
//! effect crates draw N-input passes through these; nothing here is
//! filter-specific. Shaders read inputs via `u_texture0..N-1` (and `u_texture`
//! is accepted as an alias for unit 0). Ports the TS
//! `@flighthq/render-gl/glFullscreenPass` helpers.

use glow::HasContext;

use crate::draw::use_gl_program;
use crate::render_state::{GlRenderState, GlRenderTarget};
use crate::shader::GlBitmapShader;

// Shared fullscreen vertex shader: a clip-space quad with bottom-left-origin
// texcoords, matching the render-gl quad vertex/index buffers (x, y, u, v).
const FULLSCREEN_VERTEX_SRC: &str = "#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}";

/// A compiled fullscreen-pass program (vertex + fragment) with its quad
/// vertex-array object and resolved attribute / sampler locations.
///
/// The clip-space quad vertex shader is linked to a fragment shader; `textures`
/// holds the `u_texture0..N-1` sampler locations for the N-input pass. Filter
/// and effect recipes draw through this.
pub struct GlFullscreenProgram {
    pub program: glow::Program,
    pub vao: glow::VertexArray,
    pub loc_position: u32,
    pub loc_tex_coord: u32,
    /// Sampler uniform locations for `u_texture0..N-1` (index = texture unit).
    pub textures: Vec<glow::UniformLocation>,
}

/// Clears `target` to fully transparent black and binds it as the current
/// framebuffer for subsequent passes.
pub fn clear_gl_render_target(state: &GlRenderState, target: &GlRenderTarget) {
    let gl = &state.gl;
    unsafe {
        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(target.framebuffer));
        gl.viewport(0, 0, target.width as i32, target.height as i32);
        gl.clear_color(0.0, 0.0, 0.0, 0.0);
        gl.clear(glow::COLOR_BUFFER_BIT);
    }
}

/// Compiles and links a fullscreen program from `fragment_src`.
///
/// The shared fullscreen vertex shader is prepended automatically, so
/// `fragment_src` must declare the `v_texCoord` varying and any `u_texture{i}`
/// samplers it reads.
///
/// # Panics
/// Panics if shader compilation or program linking fails — a build-time
/// programmer error in the shader source, not a recoverable runtime condition.
pub fn compile_gl_fullscreen_program(
    gl: &glow::Context,
    fragment_src: &str,
) -> GlFullscreenProgram {
    unsafe {
        let vs = compile_shader(gl, glow::VERTEX_SHADER, FULLSCREEN_VERTEX_SRC);
        let fs = compile_shader(gl, glow::FRAGMENT_SHADER, fragment_src);
        let program = gl.create_program().expect("create_program");
        gl.attach_shader(program, vs);
        gl.attach_shader(program, fs);
        gl.link_program(program);
        if !gl.get_program_link_status(program) {
            panic!(
                "Fullscreen program link error: {}",
                gl.get_program_info_log(program)
            );
        }
        gl.delete_shader(vs);
        gl.delete_shader(fs);

        let vao = gl.create_vertex_array().expect("create vao");

        let mut textures: Vec<glow::UniformLocation> = Vec::new();
        for i in 0..8 {
            if let Some(loc) = gl.get_uniform_location(program, &format!("u_texture{i}")) {
                textures.push(loc);
            }
        }
        if textures.is_empty()
            && let Some(loc) = gl.get_uniform_location(program, "u_texture")
        {
            textures.push(loc);
        }

        GlFullscreenProgram {
            program,
            vao,
            loc_position: gl.get_attrib_location(program, "a_position").unwrap_or(0),
            loc_tex_coord: gl.get_attrib_location(program, "a_texCoord").unwrap_or(0),
            textures,
        }
    }
}

/// Draws a fullscreen triangle using `shader`, sampling `texture`.
///
/// A single oversized triangle (covering the whole NDC clip rect) avoids the
/// diagonal seam of a two-triangle quad and needs no vertex buffer: the
/// positions are generated in the vertex shader from `gl_VertexID`. Here the
/// shared bitmap program is bound and a 3-vertex array draw is issued.
pub fn draw_gl_fullscreen_pass(
    state: &mut GlRenderState,
    shader: &GlBitmapShader,
    texture: glow::Texture,
) {
    use_gl_program(state, Some(shader));
    unsafe {
        if state.runtime.current_texture != Some(texture) {
            state.gl.bind_texture(glow::TEXTURE_2D, Some(texture));
            state.runtime.current_texture = Some(texture);
        }
        state
            .gl
            .uniform_1_i32(shader.locations.loc_texture.as_ref(), 0);
        state
            .gl
            .uniform_1_f32(shader.locations.loc_alpha.as_ref(), 1.0);
        state.gl.draw_arrays(glow::TRIANGLES, 0, 3);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

unsafe fn compile_shader(gl: &glow::Context, shader_type: u32, src: &str) -> glow::Shader {
    unsafe {
        let shader = gl.create_shader(shader_type).expect("create_shader");
        gl.shader_source(shader, src);
        gl.compile_shader(shader);
        if !gl.get_shader_compile_status(shader) {
            panic!(
                "Fullscreen shader compile error: {}",
                gl.get_shader_info_log(shader)
            );
        }
        shader
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // FULLSCREEN_VERTEX_SRC

    #[test]
    fn fullscreen_vertex_src_declares_quad_attributes_and_varying() {
        assert!(FULLSCREEN_VERTEX_SRC.contains("#version 300 es"));
        assert!(FULLSCREEN_VERTEX_SRC.contains("in vec2 a_position"));
        assert!(FULLSCREEN_VERTEX_SRC.contains("in vec2 a_texCoord"));
        assert!(FULLSCREEN_VERTEX_SRC.contains("out vec2 v_texCoord"));
    }
}
