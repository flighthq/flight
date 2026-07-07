//! The shared Gl Toon (cel-shading) prelude.
//!
//! Ports `@flighthq/scene-gl` `glToonPrelude.ts`.

use flighthq_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::{GlLitProgram, resolve_gl_lit_locations};
use crate::gl_mesh_program::{compile_gl_program, ensure_gl_scene_program};
use crate::gl_scene_runtime::GlSceneRuntime;

/// Feature flags selecting a Toon variant.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub struct GlToonDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_base_color_map: bool,
    pub has_ramp: bool,
}

/// A compiled Toon variant plus resolved uniform locations.
#[derive(Clone, Debug)]
pub struct GlToonProgram {
    pub lit: GlLitProgram,
    pub loc_alpha_cutoff: Option<glow::UniformLocation>,
    pub loc_base_color: Option<glow::UniformLocation>,
    pub loc_base_color_map: Option<glow::UniformLocation>,
    pub loc_ramp: Option<glow::UniformLocation>,
    pub loc_steps: Option<glow::UniformLocation>,
}

/// A short, stable string identity for a toon define key.
pub fn build_gl_toon_define_key(key: &GlToonDefineKey) -> String {
    let m = if key.alpha_mask_enabled { 'm' } else { '-' };
    let b = if key.has_base_color_map { 'b' } else { '-' };
    let r = if key.has_ramp { 'r' } else { '-' };
    format!("{m}{b}{r}")
}

/// Compiles the Toon uber-shader for a define key.
pub fn compile_gl_toon_program(gl: &glow::Context, key: &GlToonDefineKey) -> GlToonProgram {
    let program = compile_gl_program(
        gl,
        &get_gl_toon_vertex_source_for_key(key),
        &get_gl_toon_fragment_source_for_key(key),
    );
    let lit = resolve_gl_lit_locations(gl, program);
    unsafe {
        GlToonProgram {
            loc_alpha_cutoff: gl.get_uniform_location(program, "u_alphaCutoff"),
            loc_base_color: gl.get_uniform_location(program, "u_baseColor"),
            loc_base_color_map: gl.get_uniform_location(program, "u_baseColorMap"),
            loc_ramp: gl.get_uniform_location(program, "u_ramp"),
            loc_steps: gl.get_uniform_location(program, "u_steps"),
            lit,
        }
    }
}

/// Resolves the Toon program for a define key, compiling on first use.
pub fn ensure_gl_toon_program(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    key: &GlToonDefineKey,
) -> GlToonProgram {
    let cache_key = format!("toon:{}", build_gl_toon_define_key(key));
    let _base = ensure_gl_scene_program(state, scene, &cache_key, |gl| {
        let p = compile_gl_toon_program(gl, key);
        p.lit.base.clone()
    });
    if let Some(cached) = scene.toon_program_cache.get(&cache_key) {
        return cached.clone();
    }
    let p = compile_gl_toon_program(&state.gl, key);
    scene.toon_program_cache.insert(cache_key, p.clone());
    p
}

/// Full fragment source for a define key.
pub fn get_gl_toon_fragment_source_for_key(key: &GlToonDefineKey) -> String {
    format!("{}{}", build_gl_toon_define_source(key), TOON_FRAGMENT_BODY)
}

/// Full vertex source for a define key.
pub fn get_gl_toon_vertex_source_for_key(key: &GlToonDefineKey) -> String {
    format!("{}{}", build_gl_toon_define_source(key), TOON_VERTEX_BODY)
}

fn build_gl_toon_define_source(key: &GlToonDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.alpha_mask_enabled {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_base_color_map {
        defines.push_str("#define HAS_BASE_COLOR_MAP\n");
    }
    if key.has_ramp {
        defines.push_str("#define HAS_RAMP\n");
    }
    defines
}

const TOON_VERTEX_BODY: &str = r#"
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;

out vec3 v_worldPosition;
out vec3 v_normal;
out vec2 v_uv0;

void main() {
  vec4 worldPosition = u_model * vec4(a_position, 1.0);
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * a_normal;
  v_uv0 = a_uv0;
  gl_Position = u_viewProjection * worldPosition;
}
"#;

const TOON_FRAGMENT_BODY: &str = r#"
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec2 v_uv0;

uniform vec4 u_baseColor;
uniform float u_steps;
uniform float u_alphaCutoff;
uniform vec4 u_directional;
uniform vec4 u_directionalRadiance;
uniform vec3 u_ambientRadiance;
uniform float u_directionalCount;
uniform float u_ambientCount;
uniform vec3 u_cameraPosition;
uniform sampler2D u_shadowMap;
uniform mat4 u_shadowMatrix;
uniform float u_shadowEnabled;
#ifdef HAS_BASE_COLOR_MAP
uniform sampler2D u_baseColorMap;
#endif
#ifdef HAS_RAMP
uniform sampler2D u_ramp;
#endif

out vec4 fragColor;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

void main() {
  vec4 baseColor = u_baseColor;
#ifdef HAS_BASE_COLOR_MAP
  vec4 sampled = texture(u_baseColorMap, v_uv0);
  baseColor.rgb *= srgbToLinear(sampled.rgb);
  baseColor.a *= sampled.a;
#endif

#ifdef ALPHA_MASK
  if (baseColor.a < u_alphaCutoff) discard;
#endif

  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;

  vec3 radiance = vec3(0.0);

  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    float nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
#ifdef HAS_RAMP
    vec3 band = texture(u_ramp, vec2(nDotL, 0.5)).rgb;
    radiance += baseColor.rgb * band * u_directionalRadiance.rgb;
#else
    float band = floor(nDotL * u_steps) / max(u_steps, 1.0);
    radiance += baseColor.rgb * band * u_directionalRadiance.rgb;
#endif
  }

  if (u_ambientCount > 0.5) {
    radiance += baseColor.rgb * u_ambientRadiance;
  }

  fragColor = vec4(radiance, baseColor.a);
}
"#;
