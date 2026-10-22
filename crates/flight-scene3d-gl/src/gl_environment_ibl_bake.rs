// flight-lint: allow-file(contract-vocabulary) D17 the IBL bake renders through native glow handles on thread-bound render-gl state

use flight_entity::throw_error;
use flight_lighting::Environment;
use flight_render_gl::{GlCubeRenderTarget, GlRenderState, create_gl_program};
use glow::{
    HasContext, NativeBuffer, NativeFramebuffer, NativeProgram, NativeTexture,
    NativeUniformLocation, NativeVertexArray,
};

use crate::gl_environment_cube::{ensure_gl_environment_source_cube, get_gl_cube_face_target};
use crate::gl_scene3d_runtime::{add_gl_scene3d_resource_cleanup, get_gl_scene3d_runtime};
use crate::types::GlScene3DIbl;

/// TS `GlBakeProgram` (module-private): one bake pass program and its fullscreen quad.
#[derive(Clone, Copy, Debug)]
pub(crate) struct GlBakeProgram {
    // The fullscreen-quad vertex buffer bound in the vao; owned here so teardown can free it.
    pub(crate) buffer: NativeBuffer,
    pub(crate) loc_env_cube: Option<NativeUniformLocation>,
    pub(crate) loc_face_forward: Option<NativeUniformLocation>,
    pub(crate) loc_face_right: Option<NativeUniformLocation>,
    pub(crate) loc_face_up: Option<NativeUniformLocation>,
    pub(crate) loc_roughness: Option<NativeUniformLocation>,
    pub(crate) program: NativeProgram,
    pub(crate) vao: NativeVertexArray,
}

fn create_gl_bake_cube(gl: &glow::Context, size: u32, mipped: bool) -> NativeTexture {
    // SAFETY: texture creation and allocation on the owning GL thread.
    unsafe {
        let texture = gl
            .create_texture()
            .unwrap_or_else(|error| throw_error(&error));
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(texture));
        // Allocate the full mip chain up front: a cube with a mip-aware min filter is "incomplete"
        // (samples as black) until every level it can reach has storage, so each prefiltered roughness
        // level must be allocated here before the bake renders into it.
        let levels = if mipped { PREFILTERED_MIPS } else { 1 };
        for mip in 0..levels {
            let mip_size = (size >> mip).max(1);
            for face in 0..6 {
                gl.tex_image_2d(
                    get_gl_cube_face_target(gl, face),
                    mip as i32,
                    glow::RGBA16F as i32,
                    mip_size as i32,
                    mip_size as i32,
                    0,
                    glow::RGBA,
                    glow::HALF_FLOAT,
                    glow::PixelUnpackData::Slice(None),
                );
            }
        }
        let min_filter = if mipped {
            glow::LINEAR_MIPMAP_LINEAR
        } else {
            glow::LINEAR
        };
        gl.tex_parameter_i32(
            glow::TEXTURE_CUBE_MAP,
            glow::TEXTURE_MIN_FILTER,
            min_filter as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_CUBE_MAP,
            glow::TEXTURE_MAG_FILTER,
            glow::LINEAR as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_CUBE_MAP,
            glow::TEXTURE_WRAP_S,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_CUBE_MAP,
            glow::TEXTURE_WRAP_T,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_CUBE_MAP,
            glow::TEXTURE_WRAP_R,
            glow::CLAMP_TO_EDGE as i32,
        );
        if mipped {
            gl.tex_parameter_i32(
                glow::TEXTURE_CUBE_MAP,
                glow::TEXTURE_MAX_LEVEL,
                PREFILTERED_MIPS as i32 - 1,
            );
        }
        return texture;
    }
}

fn bake_gl_brdf_lut(state: &GlRenderState, fbo: NativeFramebuffer) -> NativeTexture {
    let gl = &state.gl;
    // SAFETY: texture creation and allocation on the state's owning GL thread.
    let texture = unsafe {
        let texture = gl
            .create_texture()
            .unwrap_or_else(|error| throw_error(&error));
        gl.bind_texture(glow::TEXTURE_2D, Some(texture));
        // RGBA16F (not RG16F): RG render targets are not reliably color-renderable across drivers
        // (notably headless SwiftShader); the LUT uses only R/G but stores them in a full RGBA target.
        gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            glow::RGBA16F as i32,
            BRDF_LUT_SIZE as i32,
            BRDF_LUT_SIZE as i32,
            0,
            glow::RGBA,
            glow::HALF_FLOAT,
            glow::PixelUnpackData::Slice(None),
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MIN_FILTER,
            glow::LINEAR as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MAG_FILTER,
            glow::LINEAR as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_S,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_T,
            glow::CLAMP_TO_EDGE as i32,
        );
        texture
    };

    let program = ensure_gl_bake_program(state, "brdf", BRDF_LUT_FRAGMENT);
    // SAFETY: attaching and drawing with objects of this context.
    unsafe {
        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(fbo));
        gl.framebuffer_texture_2d(
            glow::FRAMEBUFFER,
            glow::COLOR_ATTACHMENT0,
            glow::TEXTURE_2D,
            Some(texture),
            0,
        );
        gl.viewport(0, 0, BRDF_LUT_SIZE as i32, BRDF_LUT_SIZE as i32);
        gl.use_program(Some(program.program));
    }
    draw_gl_bake_quad(state, &program);
    return texture;
}

// Bakes a backend-native environment capture into the same split-sum IBL resources used by
// bake_gl_environment_ibl. A GlCubeRenderTarget cannot honestly be wrapped as Flight's cross-backend
// Texture — it is already a GL handle with caller-owned lifetime — so this explicit bridge is the
// wiring point for subsequent render_gl_scene3d calls. Scene3DLightsLike continues to carry the direct
// analytic lights; the baked environment is state-scoped, as the existing PBR bind expects.
//
// The capture bake advances environment_source_revision without destroying the Environment source cube
// — the capture uses its own GL texture, not the cube the skybox owns. Destroying the source cube
// forced the skybox to rebuild it (another revision bump), putting the IBL's stored revision behind
// the runtime's and disabling IBL for the subsequent lit draws.
pub fn bake_gl_environment_capture_ibl(
    state: &GlRenderState,
    target: &GlCubeRenderTarget,
    intensity: Option<f32>,
) {
    let intensity = intensity.unwrap_or(1.0);
    {
        let mut runtime = get_gl_scene3d_runtime(state);
        runtime.environment_source_revision = runtime.environment_source_revision.wrapping_add(1);
    }
    bake_gl_environment_ibl_from_source(state, target.texture, intensity);
}

// Bakes an Environment's source radiance cubemap into the split-sum image-based-lighting set — a
// diffuse irradiance cubemap, a roughness-mipped prefiltered specular cubemap, and the 2D BRDF
// integration LUT — and stores it on the scene runtime as `runtime.ibl`. The PBR ambient bind reads
// that to light every PBR draw from the environment (see the PBR prelude's IBL term). This is an
// explicit pass the app sequences once when the environment is set (the bake is the substantial cost);
// it is a no-op when the environment has no complete source cube. Re-baking replaces the prior set.
//
// Resolutions are deliberately modest (the bake runs in software under the headless capture harness);
// they are the technique, tunable upward for production. The BRDF LUT is environment-independent, so
// it is baked once per state and reused across re-bakes.
pub fn bake_gl_environment_ibl(state: &GlRenderState, environment: &Environment) {
    let Some(source_cube) = ensure_gl_environment_source_cube(state, environment) else {
        return;
    };

    bake_gl_environment_ibl_from_source(state, source_cube, environment.intensity);
}

fn bake_gl_environment_ibl_from_source(
    state: &GlRenderState,
    source_cube: NativeTexture,
    intensity: f32,
) {
    let gl = &state.gl;
    // WebGL's getExtension('EXT_color_buffer_float') / ('OES_texture_float_linear') only enables the
    // float render/filter paths; native GL exposes them without an enable call.
    let previous = {
        let mut runtime = get_gl_scene3d_runtime(state);
        let revision = runtime.environment_source_revision;
        if let Some(ibl) = runtime.ibl.as_mut() {
            if ibl.environment_source_revision == revision {
                ibl.intensity = intensity;
                return;
            }
        }
        runtime.ibl
    };

    let fbo = {
        let mut runtime = get_gl_scene3d_runtime(state);
        if runtime.ibl_bake_framebuffer.is_none() {
            // SAFETY: framebuffer creation on the state's owning GL thread.
            runtime.ibl_bake_framebuffer = Some(
                unsafe { gl.create_framebuffer() }.unwrap_or_else(|error| throw_error(&error)),
            );
        }
        runtime
            .ibl_bake_framebuffer
            .expect("bake framebuffer created above")
    };

    let mut prev_viewport = [0_i32; 4];
    // The three capabilities are saved for the same reason the framebuffer and viewport are: a bake
    // runs between a caller's own draws. The 3D draw path re-establishes depth and cull per draw and
    // would recover on its own, but the 2D path enables BLEND once at state creation and never again, so
    // a leak here disables alpha compositing for every later 2D draw on this context.
    // SAFETY: state queries and capability toggles on the state's owning GL thread.
    let (prev_framebuffer, prev_depth_test, prev_cull_face, prev_blend) = unsafe {
        let prev_framebuffer = gl.get_parameter_framebuffer(glow::FRAMEBUFFER_BINDING);
        gl.get_parameter_i32_slice(glow::VIEWPORT, &mut prev_viewport);
        let saved = (
            prev_framebuffer,
            gl.is_enabled(glow::DEPTH_TEST),
            gl.is_enabled(glow::CULL_FACE),
            gl.is_enabled(glow::BLEND),
        );
        gl.disable(glow::DEPTH_TEST);
        gl.disable(glow::CULL_FACE);
        gl.disable(glow::BLEND);
        saved
    };

    let irradiance_cube = bake_gl_irradiance(state, fbo, source_cube);
    let (prefiltered_cube, prefiltered_mip_count) = bake_gl_prefiltered(state, fbo, source_cube);
    let brdf_lut = match previous {
        Some(ibl) => ibl.brdf_lut,
        None => bake_gl_brdf_lut(state, fbo),
    };

    // SAFETY: restoring the state captured above on the same context.
    unsafe {
        gl.bind_framebuffer(glow::FRAMEBUFFER, prev_framebuffer);
        gl.viewport(
            prev_viewport[0],
            prev_viewport[1],
            prev_viewport[2],
            prev_viewport[3],
        );
        gl.bind_vertex_array(None);
        if prev_depth_test {
            gl.enable(glow::DEPTH_TEST);
        }
        if prev_cull_face {
            gl.enable(glow::CULL_FACE);
        }
        if prev_blend {
            gl.enable(glow::BLEND);
        }
    }

    // A rebake replaces the two baked cubes, so the pair it displaces is freed here rather than left for
    // teardown: destroy_gl_scene3d_runtime only ever sees the CURRENT set, so without this every rebake
    // before teardown orphans an irradiance and a prefiltered cube for the lifetime of the context. The
    // BRDF LUT is deliberately not freed — it is environment-independent and was reused above.
    if let Some(previous) = previous {
        // SAFETY: the replaced cubes belong to this state's context.
        unsafe {
            gl.delete_texture(previous.irradiance_cube);
            gl.delete_texture(previous.prefiltered_cube);
        }
    }

    let mut runtime = get_gl_scene3d_runtime(state);
    runtime.ibl = Some(GlScene3DIbl {
        brdf_lut,
        environment_source_revision: runtime.environment_source_revision,
        intensity,
        irradiance_cube,
        prefiltered_cube,
        prefiltered_mip_count,
    });
}

fn bake_gl_irradiance(
    state: &GlRenderState,
    fbo: NativeFramebuffer,
    source_cube: NativeTexture,
) -> NativeTexture {
    let gl = &state.gl;
    let cube = create_gl_bake_cube(gl, IRRADIANCE_SIZE, false);
    let program = ensure_gl_bake_program(state, "irradiance", IRRADIANCE_FRAGMENT);
    // SAFETY: binding objects of this context on its owning GL thread.
    unsafe {
        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(fbo));
        gl.use_program(Some(program.program));
    }
    bind_gl_bake_source_cube(gl, &program, source_cube);
    render_gl_bake_cube_faces(state, fbo, &program, cube, IRRADIANCE_SIZE, 0);
    return cube;
}

fn bake_gl_prefiltered(
    state: &GlRenderState,
    fbo: NativeFramebuffer,
    source_cube: NativeTexture,
) -> (NativeTexture, u32) {
    let gl = &state.gl;
    let cube = create_gl_bake_cube(gl, PREFILTERED_SIZE, true);
    let program = ensure_gl_bake_program(state, "prefiltered", PREFILTERED_FRAGMENT);
    // SAFETY: binding objects of this context on its owning GL thread.
    unsafe {
        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(fbo));
        gl.use_program(Some(program.program));
    }
    bind_gl_bake_source_cube(gl, &program, source_cube);

    let mip_count = PREFILTERED_MIPS;
    for mip in 0..mip_count {
        let mip_size = (PREFILTERED_SIZE >> mip).max(1);
        let roughness = if mip_count > 1 {
            mip as f32 / (mip_count - 1) as f32
        } else {
            0.0
        };
        // SAFETY: the prefilter program is bound above.
        unsafe { gl.uniform_1_f32(program.loc_roughness.as_ref(), roughness) };
        render_gl_bake_cube_faces(state, fbo, &program, cube, mip_size, mip);
    }
    return (cube, mip_count);
}

fn bind_gl_bake_source_cube(
    gl: &glow::Context,
    program: &GlBakeProgram,
    source_cube: NativeTexture,
) {
    // SAFETY: binding this context's source cube to unit 0 for the bound bake program.
    unsafe {
        gl.active_texture(glow::TEXTURE0);
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(source_cube));
        gl.uniform_1_i32(program.loc_env_cube.as_ref(), 0);
    }
}

// Frees the IBL bake shader programs cached for `state` — the irradiance / prefilter / BRDF pass
// programs and each one's fullscreen-quad VAO + vertex buffer. destroy_gl_scene3d_runtime calls this
// through the cleanup it registers on the first bake. A no-op when no bake has run for the state. The
// baked result textures (runtime.ibl) are freed separately by destroy_gl_scene3d_runtime.
pub fn destroy_gl_environment_ibl_bake_programs(state: &mut GlRenderState) {
    let Some(by_state) = get_gl_scene3d_runtime(state).ibl_bake_programs.take() else {
        return;
    };
    let gl = &state.gl;
    for (_, baked) in &by_state {
        // SAFETY: the bake objects belong to this state's context.
        unsafe {
            gl.delete_program(baked.program);
            gl.delete_vertex_array(baked.vao);
            gl.delete_buffer(baked.buffer);
        }
    }
}

fn draw_gl_bake_quad(state: &GlRenderState, program: &GlBakeProgram) {
    let gl = &state.gl;
    // SAFETY: drawing the bake program's own VAO on its context.
    unsafe {
        gl.bind_vertex_array(Some(program.vao));
        gl.draw_arrays(glow::TRIANGLE_STRIP, 0, 4);
    }
}

fn ensure_gl_bake_program(state: &GlRenderState, key: &str, fragment: &str) -> GlBakeProgram {
    let gl = &state.gl;
    let first = {
        let mut runtime = get_gl_scene3d_runtime(state);
        let first = runtime.ibl_bake_programs.is_none();
        let by_state = runtime.ibl_bake_programs.get_or_insert_with(Vec::new);
        if let Some((_, baked)) = by_state.iter().find(|(name, _)| name == key) {
            return *baked;
        }
        first
    };
    if first {
        // First bake program for this state: hand teardown to the scene runtime, which has no import
        // of this module.
        add_gl_scene3d_resource_cleanup(state, destroy_gl_environment_ibl_bake_programs);
    }

    let program = link_gl_bake_program(gl, fragment);
    // SAFETY: resource creation and attribute setup on the state's owning GL thread.
    let baked = unsafe {
        let vao = gl
            .create_vertex_array()
            .unwrap_or_else(|error| throw_error(&error));
        gl.bind_vertex_array(Some(vao));
        let buffer = gl
            .create_buffer()
            .unwrap_or_else(|error| throw_error(&error));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, f32_bytes(&QUAD), glow::STATIC_DRAW);
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_f32(0, 2, glow::FLOAT, false, 0, 0);
        gl.bind_vertex_array(None);

        GlBakeProgram {
            buffer,
            loc_env_cube: gl.get_uniform_location(program, "u_envCube"),
            loc_face_forward: gl.get_uniform_location(program, "u_faceForward"),
            loc_face_right: gl.get_uniform_location(program, "u_faceRight"),
            loc_face_up: gl.get_uniform_location(program, "u_faceUp"),
            loc_roughness: gl.get_uniform_location(program, "u_roughness"),
            program,
            vao,
        }
    };
    get_gl_scene3d_runtime(state)
        .ibl_bake_programs
        .get_or_insert_with(Vec::new)
        .push((key.to_string(), baked));
    return baked;
}

fn f32_bytes(values: &[f32]) -> &[u8] {
    // SAFETY: f32 has no padding and u8 has alignment 1, so the view covers exactly the same bytes.
    return unsafe {
        std::slice::from_raw_parts(values.as_ptr().cast::<u8>(), std::mem::size_of_val(values))
    };
}

fn link_gl_bake_program(gl: &glow::Context, fragment: &str) -> NativeProgram {
    return create_gl_program(gl, BAKE_VERTEX, fragment, Some("IBL bake"))
        .unwrap_or_else(|error| throw_error(&error));
}

// Renders all six faces of `cube` at mip `mip_level` (size `size`) through `program`, setting the
// per-face direction basis so the fragment shader reconstructs each texel's world direction.
fn render_gl_bake_cube_faces(
    state: &GlRenderState,
    _fbo: NativeFramebuffer,
    program: &GlBakeProgram,
    cube: NativeTexture,
    size: u32,
    mip_level: u32,
) {
    let gl = &state.gl;
    // SAFETY: the bake framebuffer is bound by the caller.
    unsafe { gl.viewport(0, 0, size as i32, size as i32) };
    for face in 0..6 {
        let b = &CUBE_FACE_BASIS[face as usize];
        // SAFETY: attaching this context's cube and setting uniforms on the bound bake program.
        unsafe {
            gl.framebuffer_texture_2d(
                glow::FRAMEBUFFER,
                glow::COLOR_ATTACHMENT0,
                get_gl_cube_face_target(gl, face),
                Some(cube),
                mip_level as i32,
            );
            gl.uniform_3_f32(program.loc_face_forward.as_ref(), b[0], b[1], b[2]);
            gl.uniform_3_f32(program.loc_face_right.as_ref(), b[3], b[4], b[5]);
            gl.uniform_3_f32(program.loc_face_up.as_ref(), b[6], b[7], b[8]);
        }
        draw_gl_bake_quad(state, program);
    }
}

const IRRADIANCE_SIZE: u32 = 16;

const PREFILTERED_SIZE: u32 = 64;

const PREFILTERED_MIPS: u32 = 5;

const BRDF_LUT_SIZE: u32 = 128;

// Per-face direction basis (forward = face normal, plus right/up spanning the face) in Texture face
// order, following the standard cubemap sampling convention (up = -Y on the side/Z faces because cube
// faces store top-left-origin). A fragment's world direction is
// normalize(forward + uv.x*right + uv.y*up) with uv in [-1, 1].
const CUBE_FACE_BASIS: [[f32; 9]; 6] = [
    [1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, -1.0, 0.0], // +X
    [-1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, -1.0, 0.0], // -X
    [0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0],   // +Y
    [0.0, -1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, -1.0], // -Y
    [0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, -1.0, 0.0],  // +Z
    [0.0, 0.0, -1.0, -1.0, 0.0, 0.0, 0.0, -1.0, 0.0], // -Z
];

const QUAD: [f32; 8] = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

// The bake vertex shader emits the clip-space quad and forwards the [-1,1] face coordinate so the
// fragment can build its sampling direction from the per-face basis.
macro_rules! bake_vertex_glsl {
    () => {
        concat!(
            r#"#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
"#
        )
    };
}

const BAKE_VERTEX: &str = bake_vertex_glsl!();

macro_rules! bake_common_glsl {
    () => {
        concat!(
            r#"precision highp float;
in vec2 v_uv;
uniform samplerCube u_envCube;
uniform vec3 u_faceForward;
uniform vec3 u_faceRight;
uniform vec3 u_faceUp;
out vec4 fragColor;
const float PI = 3.14159265359;

vec3 faceDirection() {
  return normalize(u_faceForward + v_uv.x * u_faceRight + v_uv.y * u_faceUp);
}
"#
        )
    };
}

macro_rules! irradiance_fragment_glsl {
    () => {
        concat!(
            r#"#version 300 es
"#,
            bake_common_glsl!(),
            r#"
void main() {
  vec3 N = faceDirection();
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 right = normalize(cross(up, N));
  up = normalize(cross(N, right));

  vec3 irradiance = vec3(0.0);
  float samples = 0.0;
  const float delta = 0.15;
  for (float phi = 0.0; phi < 2.0 * PI; phi += delta) {
    for (float theta = 0.0; theta < 0.5 * PI; theta += delta) {
      vec3 tangent = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
      vec3 sampleVec = tangent.x * right + tangent.y * up + tangent.z * N;
      irradiance += texture(u_envCube, sampleVec).rgb * cos(theta) * sin(theta);
      samples += 1.0;
    }
  }
  fragColor = vec4(PI * irradiance / samples, 1.0);
}
"#
        )
    };
}

const IRRADIANCE_FRAGMENT: &str = irradiance_fragment_glsl!();

macro_rules! prefiltered_fragment_glsl {
    () => {
        concat!(r#"#version 300 es
"#, bake_common_glsl!(), r#"
uniform float u_roughness;

float radicalInverse(uint bits) {
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}
vec2 hammersley(uint i, uint n) {
  return vec2(float(i) / float(n), radicalInverse(i));
}
vec3 importanceSampleGGX(vec2 Xi, vec3 N, float roughness) {
  float a = roughness * roughness;
  float phi = 2.0 * PI * Xi.x;
  float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  vec3 H = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, N));
  vec3 bitangent = cross(N, tangent);
  return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}
void main() {
  vec3 N = faceDirection();
  vec3 V = N;
  const uint SAMPLE_COUNT = 48u;
  vec3 prefiltered = vec3(0.0);
  float totalWeight = 0.0;
  for (uint i = 0u; i < SAMPLE_COUNT; i++) {
    vec2 Xi = hammersley(i, SAMPLE_COUNT);
    vec3 H = importanceSampleGGX(Xi, N, u_roughness);
    vec3 L = normalize(2.0 * dot(V, H) * H - V);
    float nDotL = max(dot(N, L), 0.0);
    if (nDotL > 0.0) {
      prefiltered += texture(u_envCube, L).rgb * nDotL;
      totalWeight += nDotL;
    }
  }
  fragColor = vec4(totalWeight > 0.0 ? prefiltered / totalWeight : texture(u_envCube, N).rgb, 1.0);
}
"#)
    };
}

const PREFILTERED_FRAGMENT: &str = prefiltered_fragment_glsl!();

macro_rules! brdf_lut_fragment_glsl {
    () => {
        concat!(r#"#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
const float PI = 3.14159265359;

float radicalInverse(uint bits) {
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}
vec2 hammersley(uint i, uint n) {
  return vec2(float(i) / float(n), radicalInverse(i));
}
vec3 importanceSampleGGX(vec2 Xi, vec3 N, float roughness) {
  float a = roughness * roughness;
  float phi = 2.0 * PI * Xi.x;
  float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  vec3 H = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, N));
  vec3 bitangent = cross(N, tangent);
  return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}
float geometrySchlickGGX(float nDotV, float roughness) {
  float k = roughness * roughness / 2.0;
  return nDotV / (nDotV * (1.0 - k) + k);
}
float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  return geometrySchlickGGX(max(dot(N, L), 0.0), roughness) * geometrySchlickGGX(max(dot(N, V), 0.0), roughness);
}
void main() {
  vec2 uv = v_uv * 0.5 + 0.5;
  float nDotV = max(uv.x, 0.001);
  float roughness = uv.y;
  vec3 V = vec3(sqrt(1.0 - nDotV * nDotV), 0.0, nDotV);
  vec3 N = vec3(0.0, 0.0, 1.0);
  float A = 0.0;
  float B = 0.0;
  const uint SAMPLE_COUNT = 256u;
  for (uint i = 0u; i < SAMPLE_COUNT; i++) {
    vec2 Xi = hammersley(i, SAMPLE_COUNT);
    vec3 H = importanceSampleGGX(Xi, N, roughness);
    vec3 L = normalize(2.0 * dot(V, H) * H - V);
    float nDotL = max(L.z, 0.0);
    float nDotH = max(H.z, 0.0);
    float vDotH = max(dot(V, H), 0.0);
    if (nDotL > 0.0) {
      float G = geometrySmith(N, V, L, roughness);
      float gVis = (G * vDotH) / (nDotH * nDotV);
      float Fc = pow(1.0 - vDotH, 5.0);
      A += (1.0 - Fc) * gVis;
      B += Fc * gVis;
    }
  }
  fragColor = vec4(A / float(SAMPLE_COUNT), B / float(SAMPLE_COUNT), 0.0, 1.0);
}
"#)
    };
}

const BRDF_LUT_FRAGMENT: &str = brdf_lut_fragment_glsl!();
