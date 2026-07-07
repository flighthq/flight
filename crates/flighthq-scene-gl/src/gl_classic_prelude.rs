//! The shared Gl classic prelude for Lambert/Phong/BlinnPhong.
//!
//! Ports `@flighthq/scene-gl` `glClassicPrelude.ts`.

use flighthq_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::{GlLitProgram, resolve_gl_lit_locations};
use crate::gl_mesh_program::{compile_gl_program, ensure_gl_scene_program};
use crate::gl_scene_runtime::GlSceneRuntime;

/// One classic shading model.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum GlClassicLightingModel {
    BlinnPhong,
    Lambert,
    Phong,
}

/// Feature flags selecting a classic uber-shader variant.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub struct GlClassicDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_diffuse_map: bool,
    pub has_normal_map: bool,
    pub has_specular_map: bool,
    pub lighting_model: GlClassicLightingModel,
}

/// A compiled classic uber-shader variant plus resolved uniform locations.
#[derive(Clone, Debug)]
pub struct GlClassicProgram {
    pub lit: GlLitProgram,
    pub loc_alpha_cutoff: Option<glow::UniformLocation>,
    pub loc_diffuse: Option<glow::UniformLocation>,
    pub loc_diffuse_map: Option<glow::UniformLocation>,
    pub loc_normal_map: Option<glow::UniformLocation>,
    pub loc_normal_scale: Option<glow::UniformLocation>,
    pub loc_shininess: Option<glow::UniformLocation>,
    pub loc_specular: Option<glow::UniformLocation>,
    pub loc_specular_map: Option<glow::UniformLocation>,
}

/// A short, stable string identity for a classic define key.
pub fn build_gl_classic_define_key(key: &GlClassicDefineKey) -> String {
    let model = match key.lighting_model {
        GlClassicLightingModel::Phong => 'p',
        GlClassicLightingModel::BlinnPhong => 'b',
        GlClassicLightingModel::Lambert => 'l',
    };
    let m = if key.alpha_mask_enabled { 'm' } else { '-' };
    let d = if key.has_diffuse_map { 'd' } else { '-' };
    let s = if key.has_specular_map { 's' } else { '-' };
    let n = if key.has_normal_map { 'n' } else { '-' };
    format!("{model}{m}{d}{s}{n}")
}

/// Compiles the classic uber-shader for a define key.
pub fn compile_gl_classic_program(
    gl: &glow::Context,
    key: &GlClassicDefineKey,
) -> GlClassicProgram {
    let vertex_source = get_gl_classic_vertex_source_for_key(key);
    let fragment_source = get_gl_classic_fragment_source_for_key(key);
    let program = compile_gl_program(gl, &vertex_source, &fragment_source);
    let lit = resolve_gl_lit_locations(gl, program);
    unsafe {
        GlClassicProgram {
            loc_alpha_cutoff: gl.get_uniform_location(program, "u_alphaCutoff"),
            loc_diffuse: gl.get_uniform_location(program, "u_diffuse"),
            loc_diffuse_map: gl.get_uniform_location(program, "u_diffuseMap"),
            loc_normal_map: gl.get_uniform_location(program, "u_normalMap"),
            loc_normal_scale: gl.get_uniform_location(program, "u_normalScale"),
            loc_shininess: gl.get_uniform_location(program, "u_shininess"),
            loc_specular: gl.get_uniform_location(program, "u_specular"),
            loc_specular_map: gl.get_uniform_location(program, "u_specularMap"),
            lit,
        }
    }
}

/// Resolves the classic program for a define key, compiling on first use.
pub fn ensure_gl_classic_program(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    key: &GlClassicDefineKey,
) -> GlClassicProgram {
    let cache_key = format!("classic:{}", build_gl_classic_define_key(key));
    let _base = ensure_gl_scene_program(state, scene, &cache_key, |gl| {
        let p = compile_gl_classic_program(gl, key);
        p.lit.base.clone()
    });
    // Re-fetch from cache or compile fully
    if let Some(cached) = scene.classic_program_cache.get(&cache_key) {
        return cached.clone();
    }
    let p = compile_gl_classic_program(&state.gl, key);
    scene.classic_program_cache.insert(cache_key, p.clone());
    p
}

/// The fragment shader body.
pub fn get_gl_classic_fragment_source() -> &'static str {
    CLASSIC_FRAGMENT_BODY
}

/// Full fragment source for a define key.
pub fn get_gl_classic_fragment_source_for_key(key: &GlClassicDefineKey) -> String {
    format!(
        "{}{}",
        build_gl_classic_define_source(key),
        CLASSIC_FRAGMENT_BODY
    )
}

/// The vertex shader body.
pub fn get_gl_classic_vertex_source() -> &'static str {
    CLASSIC_VERTEX_BODY
}

/// Full vertex source for a define key.
pub fn get_gl_classic_vertex_source_for_key(key: &GlClassicDefineKey) -> String {
    format!(
        "{}{}",
        build_gl_classic_define_source(key),
        CLASSIC_VERTEX_BODY
    )
}

fn build_gl_classic_define_source(key: &GlClassicDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.lighting_model == GlClassicLightingModel::Phong {
        defines.push_str("#define LIGHTING_PHONG\n");
    }
    if key.lighting_model == GlClassicLightingModel::BlinnPhong {
        defines.push_str("#define LIGHTING_BLINNPHONG\n");
    }
    if key.alpha_mask_enabled {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_diffuse_map {
        defines.push_str("#define HAS_DIFFUSE_MAP\n");
    }
    if key.has_specular_map {
        defines.push_str("#define HAS_SPECULAR_MAP\n");
    }
    if key.has_normal_map {
        defines.push_str("#define HAS_NORMAL_MAP\n");
    }
    defines
}

const CLASSIC_VERTEX_BODY: &str = r#"
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;

out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;

void main() {
  vec4 worldPosition = u_model * vec4(a_position, 1.0);
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * a_normal;
  v_tangent = vec4(u_normalMatrix * a_tangent.xyz, a_tangent.w);
  v_uv0 = a_uv0;
  gl_Position = u_viewProjection * worldPosition;
}
"#;

const CLASSIC_FRAGMENT_BODY: &str = r#"
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

uniform vec4 u_diffuse;
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
#if defined(LIGHTING_PHONG) || defined(LIGHTING_BLINNPHONG)
uniform vec4 u_specular;
uniform float u_shininess;
uniform float u_normalScale;
#endif

#ifdef HAS_DIFFUSE_MAP
uniform sampler2D u_diffuseMap;
#endif
#ifdef HAS_SPECULAR_MAP
uniform sampler2D u_specularMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif

out vec4 fragColor;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

void main() {
  vec4 diffuse = u_diffuse;
#ifdef HAS_DIFFUSE_MAP
  vec4 sampledDiffuse = texture(u_diffuseMap, v_uv0);
  diffuse.rgb *= srgbToLinear(sampledDiffuse.rgb);
  diffuse.a *= sampledDiffuse.a;
#endif

#ifdef ALPHA_MASK
  if (diffuse.a < u_alphaCutoff) discard;
#endif

  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;

  vec3 normal = geometricNormal;
#ifdef HAS_NORMAL_MAP
  vec3 tangent = normalize(v_tangent.xyz);
  vec3 bitangent = cross(geometricNormal, tangent) * v_tangent.w;
  vec3 tangentNormal = texture(u_normalMap, v_uv0).xyz * 2.0 - 1.0;
  tangentNormal.xy *= u_normalScale;
  mat3 tbn = mat3(tangent, bitangent, geometricNormal);
  normal = normalize(tbn * tangentNormal);
#endif

  vec3 radiance = vec3(0.0);

  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    float nDotL = max(dot(normal, lightDir), 0.0);
    radiance += diffuse.rgb * nDotL * u_directionalRadiance.rgb;

#if defined(LIGHTING_PHONG) || defined(LIGHTING_BLINNPHONG)
    if (nDotL > 0.0) {
      vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
      vec3 specularColor = u_specular.rgb;
  #ifdef HAS_SPECULAR_MAP
      vec4 sampledSpecular = texture(u_specularMap, v_uv0);
      specularColor *= srgbToLinear(sampledSpecular.rgb);
  #endif
  #ifdef LIGHTING_PHONG
      vec3 reflectDir = reflect(-lightDir, normal);
      float specAngle = max(dot(reflectDir, viewDir), 0.0);
  #else
      vec3 halfVec = normalize(lightDir + viewDir);
      float specAngle = max(dot(normal, halfVec), 0.0);
  #endif
      float specular = pow(specAngle, max(u_shininess, 1.0));
      radiance += specular * specularColor * u_directionalRadiance.rgb;
    }
#endif
  }

  if (u_ambientCount > 0.5) {
    radiance += diffuse.rgb * u_ambientRadiance;
  }

  fragColor = vec4(radiance, diffuse.a);
}
"#;
