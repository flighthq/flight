// flight-lint: allow-file(contract-vocabulary) D17 shaders expose glow Context callbacks and native Result diagnostics on the GL thread

use std::sync::Arc;

use flight_entity::EntityRuntimeSlot;
use flight_geometry::Matrix;
use flight_render::{RenderProxy, RenderProxy2D};
use glow::HasContext;

use crate::{GlBitmapShader, GlRenderState, GlShaderLocations, create_gl_program};

pub const DEFAULT_GL_FRAGMENT_SOURCE: &str = "#version 300 es\nprecision mediump float;\nin vec2 v_texCoord;\nuniform sampler2D u_texture;\nuniform float u_alpha;\nout vec4 fragColor;\nvoid main() {\n  vec4 color = texture(u_texture, v_texCoord) * clamp(u_alpha, 0.0, 1.0);\n  if (color.a <= 0.0) discard;\n  fragColor = color;\n}";

pub const DEFAULT_GL_VERTEX_SOURCE: &str = "#version 300 es\nin vec2 a_position;\nin vec2 a_texCoord;\nuniform mat3 u_matrix;\nout vec2 v_texCoord;\nvoid main() {\n  vec3 pos = u_matrix * vec3(a_position, 1.0);\n  gl_Position = vec4(pos.xy, 0.0, 1.0);\n  v_texCoord = a_texCoord;\n}";

pub type GlBitmapShaderOnBind =
    Arc<dyn Fn(&glow::Context, &GlShaderLocations, &RenderProxy2D<GlRenderState>)>;

// flight-lint: allow(conform-params) D17 the returned native shader owns state matrix scratch instead of accepting a borrowed source array
pub fn create_default_gl_bitmap_shader(shader_locations: GlShaderLocations) -> Arc<GlBitmapShader> {
    return Arc::new(initialize_default_gl_bitmap_shader(shader_locations));
}

// flight-lint: allow(conform-params) The native fragment-source name is descriptive; its position and source semantics are unchanged
pub fn create_gl_bitmap_shader(
    gl: &glow::Context,
    fragment_source: &str,
    on_bind: Option<GlBitmapShaderOnBind>,
) -> Result<Arc<GlBitmapShader>, String> {
    return initialize_gl_bitmap_shader(gl, fragment_source, on_bind).map(Arc::new);
}

// flight-lint: allow(conform-params) D17 the native shader reads its state-owned matrix scratch
pub fn initialize_default_gl_bitmap_shader(shader_locations: GlShaderLocations) -> GlBitmapShader {
    let locations = shader_locations.clone();
    let program = shader_locations.program;
    return GlBitmapShader {
        runtime: EntityRuntimeSlot::default(),
        locations: shader_locations,
        program,
        bind: Arc::new(move |gl, state, render_proxy| {
            set_gl_attributes(gl, &locations);
            let viewport = state.gl_runtime.borrow().render_target_viewport;
            let width = viewport.map_or(1.0, |value| value.width.max(1) as f32);
            let height = viewport.map_or(1.0, |value| value.height.max(1) as f32);
            let mut runtime = state.gl_runtime.borrow_mut();
            set_gl_matrix_from_transform(
                gl,
                &locations,
                &mut runtime.matrix_array,
                &render_proxy.transform_2d,
                width,
                height,
            );
            set_gl_base_uniforms(gl, &locations, &render_proxy.proxy);
        }),
    };
}

// flight-lint: allow(conform-params) D17 native initialization returns the owned shader and keeps source fragment text naming explicit
pub fn initialize_gl_bitmap_shader(
    gl: &glow::Context,
    fragment_source: &str,
    on_bind: Option<GlBitmapShaderOnBind>,
) -> Result<GlBitmapShader, String> {
    let locations = compile_gl_bitmap_program(gl, Some(fragment_source))?;
    let captured_locations = locations.clone();
    let program = locations.program;
    return Ok(GlBitmapShader {
        runtime: EntityRuntimeSlot::default(),
        locations,
        program,
        bind: Arc::new(move |gl, state, render_proxy| {
            set_gl_attributes(gl, &captured_locations);
            let viewport = state.gl_runtime.borrow().render_target_viewport;
            let width = viewport.map_or(1.0, |value| value.width.max(1) as f32);
            let height = viewport.map_or(1.0, |value| value.height.max(1) as f32);
            let mut runtime = state.gl_runtime.borrow_mut();
            set_gl_matrix_from_transform(
                gl,
                &captured_locations,
                &mut runtime.matrix_array,
                &render_proxy.transform_2d,
                width,
                height,
            );
            set_gl_base_uniforms(gl, &captured_locations, &render_proxy.proxy);
            if let Some(on_bind) = &on_bind {
                on_bind(gl, &captured_locations, render_proxy);
            }
        }),
    });
}

// flight-lint: allow(conform-extra) Native CPU helper separates exact matrix calculation from the GL uniform side effect for deterministic testing
#[allow(clippy::too_many_arguments)]
pub fn calculate_gl_matrix_from_values(
    matrix: &mut [f32; 9],
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
    viewport_width: f32,
    viewport_height: f32,
) {
    let iw = 2.0 / viewport_width;
    let ih = 2.0 / viewport_height;
    matrix[0] = a * iw;
    matrix[1] = -b * ih;
    matrix[2] = 0.0;
    matrix[3] = c * iw;
    matrix[4] = -d * ih;
    matrix[5] = 0.0;
    matrix[6] = tx * iw - 1.0;
    matrix[7] = -ty * ih + 1.0;
    matrix[8] = 1.0;
}

pub fn compile_default_gl_program(gl: &glow::Context) -> Result<GlShaderLocations, String> {
    return compile_gl_bitmap_program(gl, None);
}

// flight-lint: allow(conform-params) The native fragment-source name is descriptive; its position and source semantics are unchanged
pub fn compile_gl_bitmap_program(
    gl: &glow::Context,
    fragment_source: Option<&str>,
) -> Result<GlShaderLocations, String> {
    let vertex_source = native_glsl_source(DEFAULT_GL_VERTEX_SOURCE);
    let fragment_source = native_glsl_source(fragment_source.unwrap_or(DEFAULT_GL_FRAGMENT_SOURCE));
    let program = create_gl_program(gl, &vertex_source, &fragment_source, Some("Bitmap"))?;
    // SAFETY: locations are queried from a successfully linked program on its owning thread.
    unsafe {
        let loc_position = gl
            .get_attrib_location(program, "a_position")
            .ok_or_else(|| "Bitmap program link error: missing a_position attribute".to_string())?;
        let loc_tex_coord = gl
            .get_attrib_location(program, "a_texCoord")
            .ok_or_else(|| "Bitmap program link error: missing a_texCoord attribute".to_string())?;
        return Ok(GlShaderLocations {
            program,
            loc_position,
            loc_tex_coord,
            loc_matrix: gl.get_uniform_location(program, "u_matrix"),
            loc_alpha: gl.get_uniform_location(program, "u_alpha"),
            loc_color_scale: gl.get_uniform_location(program, "u_colorScale"),
            loc_color_bias: gl.get_uniform_location(program, "u_colorBias"),
            loc_has_color_scale_bias: gl.get_uniform_location(program, "u_hasColorScaleBias"),
            loc_texture: gl.get_uniform_location(program, "u_texture"),
        });
    }
}

pub fn ensure_default_gl_bitmap_shader(
    state: &GlRenderState,
) -> Result<Arc<GlBitmapShader>, String> {
    if let Some(shader) = state.gl_runtime.borrow().default_bitmap_shader.clone() {
        return Ok(shader);
    }
    let shader = create_default_gl_bitmap_shader(compile_default_gl_program(&state.gl)?);
    state.gl_runtime.borrow_mut().default_bitmap_shader = Some(Arc::clone(&shader));
    return Ok(shader);
}

// flight-lint: allow(conform-extra) Native desktop glow translates pinned WebGL GLSL version syntax explicitly
pub fn native_glsl_source(source: &str) -> String {
    if let Some(rest) = source.strip_prefix("#version 300 es") {
        return format!("#version 330 core{rest}");
    }
    return source.to_string();
}

// flight-lint: allow(conform-params) The native locations name is descriptive; its position and source semantics are unchanged
pub fn set_gl_attributes(gl: &glow::Context, locations: &GlShaderLocations) {
    // SAFETY: the shared quad vertex buffer is bound by the draw path before this call.
    unsafe {
        gl.enable_vertex_attrib_array(locations.loc_position);
        gl.enable_vertex_attrib_array(locations.loc_tex_coord);
        gl.vertex_attrib_pointer_f32(locations.loc_position, 2, glow::FLOAT, false, 16, 0);
        gl.vertex_attrib_pointer_f32(locations.loc_tex_coord, 2, glow::FLOAT, false, 16, 8);
    }
}

// flight-lint: allow(conform-params) The native locations name is descriptive; its position and source semantics are unchanged
pub fn set_gl_base_uniforms(
    gl: &glow::Context,
    locations: &GlShaderLocations,
    render_proxy: &RenderProxy<GlRenderState>,
) {
    // SAFETY: the shader program owning these locations is current.
    unsafe {
        gl.uniform_1_f32(locations.loc_alpha.as_ref(), render_proxy.alpha);
        gl.uniform_1_i32(locations.loc_texture.as_ref(), 0);
    }
}

// flight-lint: allow(conform-params) Native descriptive names replace source abbreviations without changing order or semantics
pub fn set_gl_matrix_from_transform(
    gl: &glow::Context,
    locations: &GlShaderLocations,
    matrix: &mut [f32; 9],
    transform: &Matrix,
    viewport_width: f32,
    viewport_height: f32,
) {
    set_gl_matrix_from_values(
        gl,
        locations,
        matrix,
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

// flight-lint: allow(conform-params) Native descriptive names replace source abbreviations without changing order or semantics
#[allow(clippy::too_many_arguments)]
pub fn set_gl_matrix_from_values(
    gl: &glow::Context,
    locations: &GlShaderLocations,
    matrix: &mut [f32; 9],
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
    viewport_width: f32,
    viewport_height: f32,
) {
    calculate_gl_matrix_from_values(matrix, a, b, c, d, tx, ty, viewport_width, viewport_height);
    // SAFETY: the shader program owning this location is current and the slice has nine entries.
    unsafe {
        gl.uniform_matrix_3_f32_slice(locations.loc_matrix.as_ref(), false, matrix);
    }
}
