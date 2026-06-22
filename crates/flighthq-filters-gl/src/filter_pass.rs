//! Core GL filter-pass infrastructure for `flighthq-filters-gl`.
//!
//! This is the substrate-level fullscreen-pass primitive shared by every filter
//! module: compile a fragment program, then draw a clip-space quad through it
//! reading N input textures and writing to a target (or the canvas). It mirrors
//! the TS `webglFullscreenPass.ts` / `render-webgl` helpers, kept here because
//! `flighthq-render-gl`'s public fullscreen pass is specific to the bitmap
//! shader.
//!
//! Shaders read inputs via `u_texture0..N-1` (and `u_texture` is accepted as an
//! alias for unit 0).
//!
//! ## Program cache
//!
//! Filter programs are compiled lazily and cached per `GlRenderState`. The TS
//! reference keys a `WeakMap` on the render state; the native port keys a
//! `thread_local` map on the state's address. Each cached program is boxed so
//! its address is stable while the cache holds it, which lets the lazy
//! `get_gl_*_shader` accessors hand back a `&GlFullscreenProgram` bounded by the
//! borrow of `state` (the box is never moved or freed during that borrow). The
//! cache is cleared with `clear_gl_filter_program_cache` when a state is torn
//! down, since native GL has no `WeakMap` to drop entries automatically.

use std::cell::RefCell;
use std::collections::HashMap;

use flighthq_render_gl::{GlRenderState, GlRenderTarget, get_gl_render_state_runtime};
use glow::HasContext;

// Shared fullscreen vertex shader: a clip-space quad with bottom-left-origin
// texcoords, matching the render-gl quad vertex/index buffers (x, y, u, v).
pub const FULLSCREEN_VERTEX_SRC: &str = "#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}";

/// A compiled fullscreen filter program (vertex + fragment) with its quad
/// vertex-array object and resolved attribute / sampler locations.
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

/// Compiles and links a fullscreen filter program from `fragment_src`.
///
/// The shared fullscreen vertex shader is prepended automatically, so
/// `fragment_src` must declare the `v_texCoord` varying and any `u_texture{i}`
/// samplers it reads.
///
/// # Panics
/// Panics if shader compilation or program linking fails — a build-time
/// programmer error in the shader source, not a recoverable runtime condition.
pub fn compile_gl_fullscreen_program(gl: &glow::Context, fragment_src: &str) -> GlFullscreenProgram {
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
        if textures.is_empty() {
            if let Some(loc) = gl.get_uniform_location(program, "u_texture") {
                textures.push(loc);
            }
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

/// Draws a fullscreen pass: binds `inputs[i]` to texture unit `i` and its
/// `u_texture{i}` sampler, binds `dest` (or the canvas when `None`), sets
/// premultiplied-alpha blending, calls `set_uniforms` for per-pass uploads, then
/// draws the quad.
///
/// `set_uniforms` receives the live `glow::Context` and the program handle so it
/// can resolve and upload its own uniform locations by name.
pub fn draw_gl_fullscreen_pass(
    state: &GlRenderState,
    program: &GlFullscreenProgram,
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
        draw_gl_fullscreen_quad(state, program);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Uploads the clip-space quad into the shared render-gl vertex buffer, wires the
// position/texcoord attributes through the program's VAO, and draws 6 indices.
unsafe fn draw_gl_fullscreen_quad(state: &GlRenderState, program: &GlFullscreenProgram) {
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
                "Fullscreen shader compile error: {}",
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

// ---------------------------------------------------------------------------
// Per-state lazy program cache
// ---------------------------------------------------------------------------

/// The set of lazily-compiled filter programs cached for one `GlRenderState`.
/// Each module owns one named slot; accessors compile on first use.
#[derive(Default)]
pub struct GlFilterPrograms {
    pub tint: Option<Box<GlFullscreenProgram>>,
    pub invert_tint: Option<Box<GlFullscreenProgram>>,
    pub blit: Option<Box<GlFullscreenProgram>>,
    pub blit_offset: Option<Box<GlFullscreenProgram>>,
    pub box_blur: Option<Box<GlFullscreenProgram>>,
    pub gaussian_blur: Option<Box<GlFullscreenProgram>>,
    pub color_matrix: Option<Box<GlFullscreenProgram>>,
    pub convolution: Option<Box<GlFullscreenProgram>>,
    pub displacement_map: Option<Box<GlFullscreenProgram>>,
    pub median: Option<Box<GlFullscreenProgram>>,
    pub pixelate: Option<Box<GlFullscreenProgram>>,
    pub sharpen: Option<Box<GlFullscreenProgram>>,
    pub gradient_lookup: Option<Box<GlFullscreenProgram>>,
    pub gradient_bevel_encode: Option<Box<GlFullscreenProgram>>,
    pub gradient_bevel_apply: Option<Box<GlFullscreenProgram>>,
    pub inner_clip: Option<Box<GlFullscreenProgram>>,
}

thread_local! {
    static FILTER_PROGRAMS: RefCell<HashMap<usize, Box<GlFilterPrograms>>> =
        RefCell::new(HashMap::new());
}

/// Returns the lazily-compiled program in `slot` for `state`, compiling it from
/// `fragment_src` on first use.
///
/// The returned reference is bounded by the borrow of `state`: the program is
/// boxed inside the per-state cache and is not moved or freed while `state` is
/// borrowed, so extending its lifetime to `'a` is sound. `select` picks the
/// owning slot inside the per-state `GlFilterPrograms`.
pub fn get_gl_filter_program<'a>(
    state: &'a GlRenderState,
    fragment_src: &str,
    select: impl Fn(&mut GlFilterPrograms) -> &mut Option<Box<GlFullscreenProgram>>,
) -> &'a GlFullscreenProgram {
    let key = state as *const GlRenderState as usize;
    let ptr: *const GlFullscreenProgram = FILTER_PROGRAMS.with(|cache| {
        let mut cache = cache.borrow_mut();
        let programs = cache.entry(key).or_default();
        let slot = select(programs);
        if slot.is_none() {
            *slot = Some(Box::new(compile_gl_fullscreen_program(&state.gl, fragment_src)));
        }
        slot.as_deref().expect("just compiled") as *const GlFullscreenProgram
    });
    // SAFETY: the boxed program lives in the thread-local cache keyed by `state`'s
    // address. It is not removed or moved while `state` is borrowed, so the
    // pointer is valid for `'a`.
    unsafe { &*ptr }
}

/// Drops every cached filter program for `state`. Call when tearing down a
/// `GlRenderState` so the cache does not retain stale program handles. The GL
/// programs themselves are released when the context is destroyed.
pub fn clear_gl_filter_program_cache(state: &GlRenderState) {
    let key = state as *const GlRenderState as usize;
    FILTER_PROGRAMS.with(|cache| {
        cache.borrow_mut().remove(&key);
    });
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

    // bytemuck_f32

    #[test]
    fn bytemuck_f32_reinterprets_byte_length() {
        let data = [1.0_f32, 2.0, 3.0, 4.0];
        let bytes = bytemuck_f32(&data);
        assert_eq!(bytes.len(), 16);
        assert_eq!(&bytes[0..4], &[0x00, 0x00, 0x80, 0x3F]);
    }
}
