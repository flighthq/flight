//! The shared Gl matcap prelude.
//!
//! Ports `@flighthq/scene-gl` `glMatcapPrelude.ts`.

use flighthq_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_program::{GlMeshProgram, compile_gl_program, ensure_gl_scene_program};
use crate::gl_scene_runtime::GlSceneRuntime;

/// Feature flags selecting a matcap variant.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub struct GlMatcapDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_matcap: bool,
}

/// A compiled matcap variant plus resolved uniform locations.
#[derive(Clone, Debug)]
pub struct GlMatcapProgram {
    pub base: GlMeshProgram,
    pub loc_alpha_cutoff: Option<glow::UniformLocation>,
    pub loc_matcap: Option<glow::UniformLocation>,
    pub loc_tint: Option<glow::UniformLocation>,
    pub loc_view: Option<glow::UniformLocation>,
}

/// Uploads the resolved matcap surface uniforms.
pub fn bind_gl_matcap_surface(
    state: &mut GlRenderState,
    program: &GlMatcapProgram,
    tint: &[f32; 4],
    alpha_cutoff: f32,
) {
    let gl = &state.gl;
    unsafe {
        gl.uniform_4_f32(
            program.loc_tint.as_ref(),
            tint[0],
            tint[1],
            tint[2],
            tint[3],
        );
        gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), alpha_cutoff);
    }
}

/// A short, stable string identity for a matcap define key.
pub fn build_gl_matcap_define_key(key: &GlMatcapDefineKey) -> String {
    let m = if key.alpha_mask_enabled { 'm' } else { '-' };
    let t = if key.has_matcap { 't' } else { '-' };
    format!("{m}{t}")
}

/// Compiles the matcap shader for a define key.
pub fn compile_gl_matcap_program(gl: &glow::Context, key: &GlMatcapDefineKey) -> GlMatcapProgram {
    let program = compile_gl_program(
        gl,
        &get_gl_matcap_vertex_source_for_key(key),
        &get_gl_matcap_fragment_source_for_key(key),
    );
    unsafe {
        GlMatcapProgram {
            loc_alpha_cutoff: gl.get_uniform_location(program, "u_alphaCutoff"),
            loc_matcap: gl.get_uniform_location(program, "u_matcap"),
            loc_tint: gl.get_uniform_location(program, "u_tint"),
            loc_view: gl.get_uniform_location(program, "u_view"),
            base: GlMeshProgram {
                loc_model: gl.get_uniform_location(program, "u_model"),
                loc_normal_matrix: gl.get_uniform_location(program, "u_normalMatrix"),
                loc_view_projection: gl.get_uniform_location(program, "u_viewProjection"),
                program,
            },
        }
    }
}

/// Resolves the matcap program for a define key, compiling on first use.
pub fn ensure_gl_matcap_program(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    key: &GlMatcapDefineKey,
) -> GlMatcapProgram {
    let cache_key = format!("matcap:{}", build_gl_matcap_define_key(key));
    let _base = ensure_gl_scene_program(state, scene, &cache_key, |gl| {
        let p = compile_gl_matcap_program(gl, key);
        p.base.clone()
    });
    if let Some(cached) = scene.matcap_program_cache.get(&cache_key) {
        return cached.clone();
    }
    let p = compile_gl_matcap_program(&state.gl, key);
    scene.matcap_program_cache.insert(cache_key, p.clone());
    p
}

/// Full fragment source for a define key.
pub fn get_gl_matcap_fragment_source_for_key(key: &GlMatcapDefineKey) -> String {
    format!("{}{}", build_define_source(key), MATCAP_FRAGMENT_BODY)
}

/// Full vertex source for a define key.
pub fn get_gl_matcap_vertex_source_for_key(key: &GlMatcapDefineKey) -> String {
    format!("{}{}", build_define_source(key), MATCAP_VERTEX_BODY)
}

fn build_define_source(key: &GlMatcapDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.alpha_mask_enabled {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_matcap {
        defines.push_str("#define HAS_MATCAP\n");
    }
    defines
}

const MATCAP_VERTEX_BODY: &str = r#"
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat4 u_view;
uniform mat3 u_normalMatrix;

out vec3 v_viewNormal;

void main() {
  v_viewNormal = mat3(u_view) * (u_normalMatrix * a_normal);
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}
"#;

const MATCAP_FRAGMENT_BODY: &str = r#"
precision highp float;

in vec3 v_viewNormal;

uniform vec4 u_tint;
#ifdef HAS_MATCAP
uniform sampler2D u_matcap;
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
  vec4 color = u_tint;
#ifdef HAS_MATCAP
  vec3 viewNormal = normalize(v_viewNormal);
  vec2 matcapUv = viewNormal.xy * 0.5 + 0.5;
  vec4 sampled = texture(u_matcap, matcapUv);
  color.rgb *= srgbToLinear(sampled.rgb);
  color.a *= sampled.a;
#endif
#ifdef ALPHA_MASK
  if (color.a < u_alphaCutoff) discard;
#endif
  fragColor = color;
}
"#;
