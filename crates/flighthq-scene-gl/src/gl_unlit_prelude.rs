//! The shared Gl unlit prelude for Unlit/Emissive/VertexColor materials.
//!
//! Ports `@flighthq/scene-gl` `glUnlitPrelude.ts`.

use flighthq_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_program::{GlMeshProgram, compile_gl_program, ensure_gl_scene_program};
use crate::gl_scene_runtime::GlSceneRuntime;

/// Feature flags selecting an unlit variant.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub struct GlUnlitDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_color_map: bool,
    pub vertex_color: bool,
}

/// A compiled unlit variant plus resolved uniform locations.
#[derive(Clone, Debug)]
pub struct GlUnlitProgram {
    pub base: GlMeshProgram,
    pub loc_alpha_cutoff: Option<glow::UniformLocation>,
    pub loc_color: Option<glow::UniformLocation>,
    pub loc_color_map: Option<glow::UniformLocation>,
    pub loc_intensity: Option<glow::UniformLocation>,
}

/// Uploads the resolved unlit surface uniforms.
pub fn bind_gl_unlit_surface(
    state: &mut GlRenderState,
    program: &GlUnlitProgram,
    color: &[f32; 4],
    intensity: f32,
    alpha_cutoff: f32,
) {
    let gl = &state.gl;
    unsafe {
        gl.uniform_4_f32(
            program.loc_color.as_ref(),
            color[0],
            color[1],
            color[2],
            color[3],
        );
        gl.uniform_1_f32(program.loc_intensity.as_ref(), intensity);
        gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), alpha_cutoff);
    }
}

/// A short, stable string identity for an unlit define key.
pub fn build_gl_unlit_define_key(key: &GlUnlitDefineKey) -> String {
    let m = if key.alpha_mask_enabled { 'm' } else { '-' };
    let c = if key.has_color_map { 'c' } else { '-' };
    let v = if key.vertex_color { 'v' } else { '-' };
    format!("{m}{c}{v}")
}

/// Compiles the unlit shader for a define key.
pub fn compile_gl_unlit_program(gl: &glow::Context, key: &GlUnlitDefineKey) -> GlUnlitProgram {
    let program = compile_gl_program(
        gl,
        &get_gl_unlit_vertex_source_for_key(key),
        &get_gl_unlit_fragment_source_for_key(key),
    );
    unsafe {
        GlUnlitProgram {
            loc_alpha_cutoff: gl.get_uniform_location(program, "u_alphaCutoff"),
            loc_color: gl.get_uniform_location(program, "u_color"),
            loc_color_map: gl.get_uniform_location(program, "u_colorMap"),
            loc_intensity: gl.get_uniform_location(program, "u_intensity"),
            base: GlMeshProgram {
                loc_model: gl.get_uniform_location(program, "u_model"),
                loc_normal_matrix: None,
                loc_view_projection: gl.get_uniform_location(program, "u_viewProjection"),
                program,
            },
        }
    }
}

/// Resolves the unlit program for a define key, compiling on first use.
pub fn ensure_gl_unlit_program(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    key: &GlUnlitDefineKey,
) -> GlUnlitProgram {
    let cache_key = format!("unlit:{}", build_gl_unlit_define_key(key));
    let _base = ensure_gl_scene_program(state, scene, &cache_key, |gl| {
        let p = compile_gl_unlit_program(gl, key);
        p.base.clone()
    });
    if let Some(cached) = scene.unlit_program_cache.get(&cache_key) {
        return cached.clone();
    }
    let p = compile_gl_unlit_program(&state.gl, key);
    scene.unlit_program_cache.insert(cache_key, p.clone());
    p
}

/// Full fragment source for a define key.
pub fn get_gl_unlit_fragment_source_for_key(key: &GlUnlitDefineKey) -> String {
    format!("{}{}", build_define_source(key), UNLIT_FRAGMENT_BODY)
}

/// Full vertex source for a define key.
pub fn get_gl_unlit_vertex_source_for_key(key: &GlUnlitDefineKey) -> String {
    format!("{}{}", build_define_source(key), UNLIT_VERTEX_BODY)
}

fn build_define_source(key: &GlUnlitDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.alpha_mask_enabled {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_color_map {
        defines.push_str("#define HAS_COLOR_MAP\n");
    }
    if key.vertex_color {
        defines.push_str("#define VERTEX_COLOR\n");
    }
    defines
}

const UNLIT_VERTEX_BODY: &str = r#"
layout(location = 0) in vec3 a_position;
layout(location = 3) in vec2 a_uv0;
#ifdef VERTEX_COLOR
layout(location = 4) in vec4 a_color0;
out vec4 v_color0;
#endif

uniform mat4 u_viewProjection;
uniform mat4 u_model;

out vec2 v_uv0;

void main() {
  v_uv0 = a_uv0;
#ifdef VERTEX_COLOR
  v_color0 = a_color0;
#endif
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}
"#;

const UNLIT_FRAGMENT_BODY: &str = r#"
precision highp float;

in vec2 v_uv0;
#ifdef VERTEX_COLOR
in vec4 v_color0;
#endif

uniform vec4 u_color;
uniform float u_intensity;
#ifdef HAS_COLOR_MAP
uniform sampler2D u_colorMap;
#endif
#ifdef ALPHA_MASK
uniform float u_alphaCutoff;
#endif

out vec4 fragColor;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

void main() {
  vec4 color = u_color;
#ifdef VERTEX_COLOR
  color *= v_color0;
#endif
#ifdef HAS_COLOR_MAP
  vec4 sampled = texture(u_colorMap, v_uv0);
  color.rgb *= srgbToLinear(sampled.rgb);
  color.a *= sampled.a;
#endif
#ifdef ALPHA_MASK
  if (color.a < u_alphaCutoff) discard;
#endif
  fragColor = vec4(color.rgb * u_intensity, color.a);
}
"#;
