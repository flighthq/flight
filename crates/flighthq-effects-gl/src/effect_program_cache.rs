//! Per-state cache of compiled effect fullscreen programs, keyed by a stable
//! string, plus the self-contained fullscreen-pass primitive the effect recipes
//! draw with.
//!
//! Effect recipes call [`get_gl_effect_program`] with their own key + fragment
//! GLSL source so each program compiles once per state and is reused every
//! frame.  The GLSL is the fragment half only; the shared fullscreen-quad vertex
//! shader [`EFFECT_VERTEX_SRC`] is prepended automatically, so a recipe fragment
//! must declare the `v_texCoord` varying and any `u_texture{i}` samplers it
//! reads.  Keeps compiled programs off the render-state runtime type.
//!
//! This crate is self-contained: it does not route the fullscreen pass through
//! `flighthq-filters-gl` (which keeps its own per-filter slot cache).  The
//! primitive lives here, built directly on `glow` and the live render state's
//! shared quad buffers, mirroring `flighthq-effects-wgpu`'s
//! `effect_program_cache` and the TS `getWebGLEffectProgram` from `effects-webgl`.
//!
//! ## Program cache
//!
//! Effect programs are compiled lazily and cached per `GlRenderState`. The TS
//! reference keys a `WeakMap` on the render state; the native port keys a
//! `thread_local` map on the state's address, with each program boxed so its
//! address is stable while the cache holds it. That lets [`get_gl_effect_program`]
//! hand back a `&GlEffectProgram` bounded by the borrow of `state` (the box is
//! never moved or freed during that borrow). The cache is cleared with
//! [`clear_gl_effect_program_cache`] when a state is torn down.

use std::cell::RefCell;
use std::collections::HashMap;

use flighthq_render_gl::get_gl_render_state_runtime;
use flighthq_render_gl::render_state::{GlRenderState, GlRenderTarget};
use glow::HasContext;

/// Shared fullscreen vertex shader: a clip-space quad with bottom-left-origin
/// texcoords, matching the render-gl shared quad vertex/index buffers
/// (x, y, u, v).
pub const EFFECT_VERTEX_SRC: &str = "#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}";

/// A compiled fullscreen-pass program ready for use as an effect recipe.
pub struct GlEffectProgram {
    pub program: glow::Program,
    /// VAO for the fullscreen quad (two triangles covering NDC [-1, 1]).
    pub vao: glow::VertexArray,
    /// `a_position` attribute location.
    pub loc_position: u32,
    /// `a_texCoord` attribute location.
    pub loc_tex_coord: u32,
    /// Sampler uniform locations for `u_texture0..N-1` (index = texture unit);
    /// `u_texture` is accepted as an alias for unit 0.
    pub textures: Vec<glow::UniformLocation>,
}

/// Clears `target` to fully transparent black and binds it as the current
/// framebuffer for subsequent passes.
pub fn clear_gl_effect_target(state: &GlRenderState, target: &GlRenderTarget) {
    let gl = &state.gl;
    unsafe {
        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(target.framebuffer));
        gl.viewport(0, 0, target.width as i32, target.height as i32);
        gl.clear_color(0.0, 0.0, 0.0, 0.0);
        gl.clear(glow::COLOR_BUFFER_BIT);
    }
}

/// Drops every cached effect program for `state`. Call when tearing down a
/// `GlRenderState` so the cache does not retain stale program handles. The GL
/// programs themselves are released when the context is destroyed.
pub fn clear_gl_effect_program_cache(state: &GlRenderState) {
    let key = state as *const GlRenderState as usize;
    EFFECT_PROGRAMS.with(|cache| {
        cache.borrow_mut().remove(&key);
    });
}

/// Compiles and links a fullscreen effect program from `fragment_src`.
///
/// [`EFFECT_VERTEX_SRC`] is prepended automatically, so `fragment_src` must
/// declare the `v_texCoord` varying and any `u_texture{i}` samplers it reads.
///
/// # Panics
/// Panics if shader compilation or program linking fails — a build-time
/// programmer error in the shader source, not a recoverable runtime condition.
pub fn compile_gl_effect_program(gl: &glow::Context, fragment_src: &str) -> GlEffectProgram {
    unsafe {
        let vs = compile_shader(gl, glow::VERTEX_SHADER, EFFECT_VERTEX_SRC);
        let fs = compile_shader(gl, glow::FRAGMENT_SHADER, fragment_src);
        let program = gl.create_program().expect("create_program");
        gl.attach_shader(program, vs);
        gl.attach_shader(program, fs);
        gl.link_program(program);
        if !gl.get_program_link_status(program) {
            panic!(
                "Effect program link error: {}",
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
        if textures.is_empty() {
            if let Some(loc) = gl.get_uniform_location(program, "u_texture") {
                textures.push(loc);
            }
        }

        GlEffectProgram {
            program,
            vao,
            loc_position: gl.get_attrib_location(program, "a_position").unwrap_or(0),
            loc_tex_coord: gl.get_attrib_location(program, "a_texCoord").unwrap_or(0),
            textures,
        }
    }
}

/// Draws a fullscreen effect pass: binds `inputs[i]` to texture unit `i` and its
/// `u_texture{i}` sampler, binds `dest` (or the canvas when `None`), sets
/// premultiplied-alpha blending, calls `set_uniforms` for per-pass uploads, then
/// draws the shared quad.
///
/// `set_uniforms` receives the live `glow::Context` and the program handle so it
/// can resolve and upload its own uniform locations by name. Mirrors
/// `flighthq-filters-gl`'s `draw_gl_fullscreen_pass`.
pub fn draw_gl_effect_fullscreen_pass(
    state: &GlRenderState,
    program: &GlEffectProgram,
    inputs: &[glow::Texture],
    dest: Option<&GlRenderTarget>,
    set_uniforms: impl FnOnce(&glow::Context, glow::Program),
) {
    let runtime = get_gl_render_state_runtime(state);
    let gl = &state.gl;
    unsafe {
        gl.use_program(Some(program.program));

        let dest_framebuffer = dest.map(|d| d.framebuffer);
        gl.bind_framebuffer(glow::FRAMEBUFFER, dest_framebuffer);
        let (dest_width, dest_height) = match dest {
            Some(d) => (d.width, d.height),
            None => (
                runtime.default_viewport_width.max(1),
                runtime.default_viewport_height.max(1),
            ),
        };
        gl.viewport(0, 0, dest_width as i32, dest_height as i32);

        for (i, texture) in inputs.iter().enumerate() {
            gl.active_texture(glow::TEXTURE0 + i as u32);
            gl.bind_texture(glow::TEXTURE_2D, Some(*texture));
            if let Some(loc) = program.textures.get(i) {
                gl.uniform_1_i32(Some(loc), i as i32);
            }
        }
        gl.active_texture(glow::TEXTURE0);

        gl.enable(glow::BLEND);
        gl.blend_func(glow::ONE, glow::ONE_MINUS_SRC_ALPHA);

        set_uniforms(gl, program.program);
        draw_gl_effect_quad(state, program);
    }
}

/// Returns the compiled fullscreen program for `key`, compiling it from
/// `fragment_src` on first call.  Subsequent calls return the cached program.
///
/// The returned reference is bounded by the borrow of `state`: the program is
/// boxed inside the per-state cache and is not moved or freed while `state` is
/// borrowed, so extending its lifetime to `'state` is sound.
pub fn get_gl_effect_program<'state>(
    state: &'state mut GlRenderState,
    key: &str,
    fragment_src: &str,
) -> &'state GlEffectProgram {
    let state_id = state as *const GlRenderState as usize;
    let ptr: *const GlEffectProgram = EFFECT_PROGRAMS.with(|cache| {
        let mut cache = cache.borrow_mut();
        let per_state = cache.entry(state_id).or_default();
        let boxed = per_state
            .entry(key.to_string())
            .or_insert_with(|| Box::new(compile_gl_effect_program(&state.gl, fragment_src)));
        boxed.as_ref() as *const GlEffectProgram
    });
    // SAFETY: the boxed program lives in the thread-local cache keyed by `state`'s
    // address. It is not removed or moved while `state` is borrowed, so the
    // pointer is valid for `'state`.
    unsafe { &*ptr }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Uploads the clip-space quad into the shared render-gl vertex buffer, wires the
// position/texcoord attributes through the program's VAO, and draws 6 indices.
unsafe fn draw_gl_effect_quad(state: &GlRenderState, program: &GlEffectProgram) {
    let runtime = get_gl_render_state_runtime(state);
    let gl = &state.gl;
    // x, y, u, v per corner — clip-space quad, bottom-left-origin texcoords.
    let v: [f32; 16] = [
        -1.0, -1.0, 0.0, 0.0, // bottom-left
        1.0, -1.0, 1.0, 0.0, // bottom-right
        1.0, 1.0, 1.0, 1.0, // top-right
        -1.0, 1.0, 0.0, 1.0, // top-left
    ];
    unsafe {
        gl.bind_vertex_array(Some(program.vao));
        gl.bind_buffer(glow::ARRAY_BUFFER, runtime.quad_vertex_buffer);
        gl.buffer_sub_data_u8_slice(glow::ARRAY_BUFFER, 0, bytemuck_f32(&v));
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, runtime.quad_index_buffer);
        gl.enable_vertex_attrib_array(program.loc_position);
        gl.enable_vertex_attrib_array(program.loc_tex_coord);
        gl.vertex_attrib_pointer_f32(program.loc_position, 2, glow::FLOAT, false, 16, 0);
        gl.vertex_attrib_pointer_f32(program.loc_tex_coord, 2, glow::FLOAT, false, 16, 8);
        gl.draw_elements(glow::TRIANGLES, 6, glow::UNSIGNED_SHORT, 0);
        gl.bind_vertex_array(None);
    }
}

unsafe fn compile_shader(gl: &glow::Context, shader_type: u32, src: &str) -> glow::Shader {
    unsafe {
        let shader = gl.create_shader(shader_type).expect("create_shader");
        gl.shader_source(shader, src);
        gl.compile_shader(shader);
        if !gl.get_shader_compile_status(shader) {
            panic!(
                "Effect shader compile error: {}",
                gl.get_shader_info_log(shader)
            );
        }
        shader
    }
}

// Reinterprets an `f32` slice as raw little-endian bytes for buffer upload.
fn bytemuck_f32(data: &[f32]) -> &[u8] {
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

thread_local! {
    // Per-state effect-program cache keyed by state pointer identity and program
    // key string (the Rust analog of the TS WeakMap<WebGLRenderState, Map<...>>).
    static EFFECT_PROGRAMS: RefCell<HashMap<usize, HashMap<String, Box<GlEffectProgram>>>> =
        RefCell::new(HashMap::new());
}

#[cfg(test)]
mod tests {
    use super::*;

    // EFFECT_VERTEX_SRC

    #[test]
    fn effect_vertex_src_declares_quad_attributes_and_varying() {
        assert!(EFFECT_VERTEX_SRC.contains("#version 300 es"));
        assert!(EFFECT_VERTEX_SRC.contains("in vec2 a_position"));
        assert!(EFFECT_VERTEX_SRC.contains("in vec2 a_texCoord"));
        assert!(EFFECT_VERTEX_SRC.contains("out vec2 v_texCoord"));
    }

    // bytemuck_f32

    #[test]
    fn bytemuck_f32_reinterprets_byte_length() {
        let data = [1.0_f32, 2.0, 3.0, 4.0];
        let bytes = bytemuck_f32(&data);
        assert_eq!(bytes.len(), 16);
        assert_eq!(&bytes[0..4], &[0x00, 0x00, 0x80, 0x3F]);
    }
}
