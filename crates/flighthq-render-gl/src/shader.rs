//! GL shader compilation, attribute/uniform setup, and matrix helpers.

use glow::HasContext;

use crate::render_state::GlRenderState;

// ---------------------------------------------------------------------------
// Shader sources — the standard quad vertex shader and default bitmap fragment.
// ---------------------------------------------------------------------------

/// Standard quad vertex shader: applies a 3×3 NDC matrix to `a_position` and
/// forwards `a_texCoord`. Shared by every non-instanced bitmap program.
pub const VERTEX_SRC: &str = "#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
uniform mat3 u_matrix;
out vec2 v_texCoord;
void main() {
  vec3 pos = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_texCoord = a_texCoord;
}";

/// Default bitmap fragment shader: samples `u_texture` and scales by `u_alpha`,
/// discarding fully transparent fragments. Premultiplied-alpha convention.
pub const FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_alpha;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord) * clamp(u_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  fragColor = color;
}";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Attribute and uniform locations for the standard bitmap program.
#[derive(Clone, Debug)]
pub struct GlShaderLocations {
    pub program: glow::Program,
    pub loc_position: u32,
    pub loc_tex_coord: u32,
    pub loc_matrix: Option<glow::UniformLocation>,
    pub loc_alpha: Option<glow::UniformLocation>,
    pub loc_texture: Option<glow::UniformLocation>,
    /// Color-transform uniforms — `None` unless the color-transform program is compiled.
    pub loc_color_multiplier: Option<glow::UniformLocation>,
    pub loc_color_offset: Option<glow::UniformLocation>,
    pub loc_has_color_transform: Option<glow::UniformLocation>,
}

/// A compiled, bindable bitmap shader.
pub struct GlBitmapShader {
    pub locations: GlShaderLocations,
    pub program: glow::Program,
}

impl GlBitmapShader {
    /// Binds this shader and uploads per-draw uniforms from the render proxy.
    ///
    /// Mirrors the TS `bind` closure: set the interleaved quad attributes, the
    /// NDC matrix derived from the proxy transform, and the base uniforms.
    pub fn bind(
        &self,
        state: &mut GlRenderState,
        render_proxy_alpha: f32,
        transform: &flighthq_types::geometry::Matrix,
    ) {
        let (vw, vh) = viewport_dimensions(state);
        let gl = &state.gl;
        let loc = self.locations.clone();
        let mut m = state.runtime.matrix_array;
        unsafe {
            set_gl_attributes(gl, &loc);
            set_gl_matrix_from_transform(gl, &loc, &mut m, transform, vw, vh);
            set_gl_base_uniforms(gl, &loc, render_proxy_alpha);
        }
        state.runtime.matrix_array = m;
    }
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Compiles and links the standard quad vertex + default bitmap fragment programs.
pub fn compile_default_gl_program(gl: &glow::Context) -> GlShaderLocations {
    compile_gl_bitmap_program(gl, FRAGMENT_SRC)
}

/// Compiles a bitmap program using `fragment_src` as the fragment shader.
///
/// The standard quad vertex shader is reused, so `fragment_src` must declare
/// the expected varyings (`v_texCoord`) and uniforms (`u_texture`, `u_alpha`).
///
/// # Panics
/// Panics if shader compilation or program linking fails — that is a build-time
/// programmer error in the shader source, not a recoverable runtime condition.
pub fn compile_gl_bitmap_program(gl: &glow::Context, fragment_src: &str) -> GlShaderLocations {
    unsafe {
        let vs = compile_shader(gl, glow::VERTEX_SHADER, VERTEX_SRC);
        let fs = compile_shader(gl, glow::FRAGMENT_SHADER, fragment_src);
        let program = gl.create_program().expect("create_program");
        gl.attach_shader(program, vs);
        gl.attach_shader(program, fs);
        gl.link_program(program);
        if !gl.get_program_link_status(program) {
            panic!("Program link error: {}", gl.get_program_info_log(program));
        }
        gl.delete_shader(vs);
        gl.delete_shader(fs);
        GlShaderLocations {
            program,
            loc_position: gl.get_attrib_location(program, "a_position").unwrap_or(0),
            loc_tex_coord: gl.get_attrib_location(program, "a_texCoord").unwrap_or(0),
            loc_matrix: gl.get_uniform_location(program, "u_matrix"),
            loc_alpha: gl.get_uniform_location(program, "u_alpha"),
            loc_texture: gl.get_uniform_location(program, "u_texture"),
            loc_color_multiplier: gl.get_uniform_location(program, "u_colorMultiplier"),
            loc_color_offset: gl.get_uniform_location(program, "u_colorOffset"),
            loc_has_color_transform: gl.get_uniform_location(program, "u_hasColorTransform"),
        }
    }
}

/// Builds the default bitmap shader wrapping `shader_loc`.
pub fn create_default_gl_bitmap_shader(shader_loc: GlShaderLocations) -> GlBitmapShader {
    let program = shader_loc.program;
    GlBitmapShader {
        locations: shader_loc,
        program,
    }
}

/// Builds a `GlBitmapShader` from a custom fragment shader source.
pub fn create_gl_bitmap_shader(gl: &glow::Context, fragment_src: &str) -> GlBitmapShader {
    let locations = compile_gl_bitmap_program(gl, fragment_src);
    let program = locations.program;
    GlBitmapShader { locations, program }
}

/// Enables position and texcoord vertex attribute arrays and sets their pointers
/// for the interleaved (x, y, u, v) × f32 quad layout (stride 16, offsets 0/8).
///
/// # Safety
/// The GL context must be current and a valid array buffer bound.
pub unsafe fn set_gl_attributes(gl: &glow::Context, loc: &GlShaderLocations) {
    unsafe {
        gl.enable_vertex_attrib_array(loc.loc_position);
        gl.enable_vertex_attrib_array(loc.loc_tex_coord);
        gl.vertex_attrib_pointer_f32(loc.loc_position, 2, glow::FLOAT, false, 16, 0);
        gl.vertex_attrib_pointer_f32(loc.loc_tex_coord, 2, glow::FLOAT, false, 16, 8);
    }
}

/// Uploads the standard base uniforms (alpha, texture unit 0) to the bound program.
///
/// # Safety
/// The GL context must be current and `loc.program` in use.
pub unsafe fn set_gl_base_uniforms(gl: &glow::Context, loc: &GlShaderLocations, alpha: f32) {
    unsafe {
        gl.uniform_1_f32(loc.loc_alpha.as_ref(), alpha);
        gl.uniform_1_i32(loc.loc_texture.as_ref(), 0);
    }
}

/// Converts a 2D affine transform into a 3×3 NDC matrix and uploads it.
///
/// # Safety
/// The GL context must be current and `loc.program` in use.
pub unsafe fn set_gl_matrix_from_transform(
    gl: &glow::Context,
    loc: &GlShaderLocations,
    m: &mut [f32; 9],
    transform: &flighthq_types::geometry::Matrix,
    viewport_width: u32,
    viewport_height: u32,
) {
    unsafe {
        set_gl_matrix_from_values(
            gl,
            loc,
            m,
            transform.a,
            transform.b,
            transform.c,
            transform.d,
            transform.tx,
            transform.ty,
            viewport_width,
            viewport_height,
        );
    }
}

/// Converts raw affine components into a 3×3 NDC matrix and uploads it.
///
/// # Safety
/// The GL context must be current and `loc.program` in use.
#[allow(clippy::too_many_arguments)]
pub unsafe fn set_gl_matrix_from_values(
    gl: &glow::Context,
    loc: &GlShaderLocations,
    m: &mut [f32; 9],
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
    viewport_width: u32,
    viewport_height: u32,
) {
    pack_gl_ndc_matrix(m, a, b, c, d, tx, ty, viewport_width, viewport_height);
    unsafe {
        gl.uniform_matrix_3_f32_slice(loc.loc_matrix.as_ref(), false, m);
    }
}

/// Packs a 2D affine transform into a column-major 3×3 NDC matrix (the layout
/// `glUniformMatrix3fv` expects). Pure CPU math — no GL calls — so it is the
/// unit-testable seam for matrix construction.
#[allow(clippy::too_many_arguments)]
pub fn pack_gl_ndc_matrix(
    m: &mut [f32; 9],
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
    viewport_width: u32,
    viewport_height: u32,
) {
    let iw = 2.0 / viewport_width as f32;
    let ih = 2.0 / viewport_height as f32;
    m[0] = a * iw;
    m[1] = -b * ih;
    m[2] = 0.0;
    m[3] = c * iw;
    m[4] = -d * ih;
    m[5] = 0.0;
    m[6] = tx * iw - 1.0;
    m[7] = -ty * ih + 1.0;
    m[8] = 1.0;
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
            panic!("Shader compile error: {}", gl.get_shader_info_log(shader));
        }
        shader
    }
}

/// Returns the active viewport dimensions for matrix construction: the off-screen
/// render-target viewport if one is bound, otherwise the default framebuffer size
/// tracked on the runtime.
pub fn viewport_dimensions(state: &GlRenderState) -> (u32, u32) {
    match state.runtime.render_target_viewport {
        Some(vp) => (vp.width.max(1), vp.height.max(1)),
        None => (
            state.runtime.default_viewport_width.max(1),
            state.runtime.default_viewport_height.max(1),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // pack_gl_ndc_matrix

    #[test]
    fn pack_gl_ndc_matrix_maps_identity_to_clip_space() {
        let mut m = [0.0_f32; 9];
        pack_gl_ndc_matrix(&mut m, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 800, 600);
        // Column-major: m[0] = a * (2/w), m[4] = -d * (2/h).
        assert!((m[0] - 2.0 / 800.0).abs() < 1e-6);
        assert!((m[4] - (-2.0 / 600.0)).abs() < 1e-6);
        // Origin maps to the top-left corner (-1, +1) in clip space.
        assert!((m[6] - (-1.0)).abs() < 1e-6);
        assert!((m[7] - 1.0).abs() < 1e-6);
        assert_eq!(m[8], 1.0);
    }

    #[test]
    fn pack_gl_ndc_matrix_translates_to_clip_space() {
        let mut m = [0.0_f32; 9];
        // A point translated to the viewport center should land at clip origin (0, 0).
        pack_gl_ndc_matrix(&mut m, 1.0, 0.0, 0.0, 1.0, 400.0, 300.0, 800, 600);
        assert!(m[6].abs() < 1e-6, "tx maps to clip x 0, got {}", m[6]);
        assert!(m[7].abs() < 1e-6, "ty maps to clip y 0, got {}", m[7]);
    }

    #[test]
    fn pack_gl_ndc_matrix_flips_y_axis() {
        let mut m = [0.0_f32; 9];
        pack_gl_ndc_matrix(&mut m, 2.0, 3.0, 4.0, 5.0, 0.0, 0.0, 100, 100);
        // b and d are negated (Y-down screen -> Y-up clip).
        assert!(m[1] < 0.0);
        assert!(m[4] < 0.0);
        // a and c keep their sign.
        assert!(m[0] > 0.0);
        assert!(m[3] > 0.0);
    }

    // FRAGMENT_SRC

    #[test]
    fn fragment_src_declares_default_bitmap_interface() {
        assert!(FRAGMENT_SRC.contains("#version 300 es"));
        assert!(FRAGMENT_SRC.contains("uniform sampler2D u_texture"));
        assert!(FRAGMENT_SRC.contains("uniform float u_alpha"));
        assert!(FRAGMENT_SRC.contains("in vec2 v_texCoord"));
        assert!(FRAGMENT_SRC.contains("out vec4 fragColor"));
    }

    // VERTEX_SRC

    #[test]
    fn vertex_src_declares_quad_attributes_and_matrix() {
        assert!(VERTEX_SRC.contains("#version 300 es"));
        assert!(VERTEX_SRC.contains("in vec2 a_position"));
        assert!(VERTEX_SRC.contains("in vec2 a_texCoord"));
        assert!(VERTEX_SRC.contains("uniform mat3 u_matrix"));
        assert!(VERTEX_SRC.contains("out vec2 v_texCoord"));
    }
}
