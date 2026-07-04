//! The shared Gl debug prelude for Depth/Normal materials.
//!
//! Ports `@flighthq/scene-gl` `glDebugPrelude.ts`.

use flighthq_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_program::{GlMeshProgram, compile_gl_program, ensure_gl_scene_program};
use crate::gl_scene_runtime::GlSceneRuntime;

/// A compiled debug variant plus resolved uniform locations.
#[derive(Clone, Debug)]
pub struct GlDebugProgram {
    pub base: GlMeshProgram,
    pub loc_far: Option<glow::UniformLocation>,
    pub loc_near: Option<glow::UniformLocation>,
    pub loc_normal_map: Option<glow::UniformLocation>,
    pub loc_normal_scale: Option<glow::UniformLocation>,
}

/// Feature flags selecting a debug variant.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum GlDebugMode {
    Depth,
    Normal,
}

/// The feature flags that select a debug variant.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub struct GlDebugDefineKey {
    pub has_normal_map: bool,
    pub mode: GlDebugMode,
}

/// Binds the optional tangent-space normal map and its scale for the normal-mode
/// debug material.
pub fn bind_gl_debug_normal_map(
    state: &mut GlRenderState,
    program: &GlDebugProgram,
    _normal_scale: f32,
) {
    let gl = &state.gl;
    unsafe {
        gl.uniform_1_f32(program.loc_normal_scale.as_ref(), _normal_scale);
    }
}

/// Uploads the depth-mode linearization range.
pub fn bind_gl_debug_range(
    state: &mut GlRenderState,
    program: &GlDebugProgram,
    near: f32,
    far: f32,
) {
    let gl = &state.gl;
    unsafe {
        gl.uniform_1_f32(program.loc_near.as_ref(), near);
        gl.uniform_1_f32(program.loc_far.as_ref(), far);
    }
}

/// A short, stable string identity for a debug define key.
pub fn build_gl_debug_define_key(key: &GlDebugDefineKey) -> String {
    let mode = match key.mode {
        GlDebugMode::Depth => 'd',
        GlDebugMode::Normal => 'n',
    };
    let m = if key.has_normal_map { 'm' } else { '-' };
    format!("{mode}{m}")
}

/// Compiles the debug shader for a define key.
pub fn compile_gl_debug_program(gl: &glow::Context, key: &GlDebugDefineKey) -> GlDebugProgram {
    let program = compile_gl_program(
        gl,
        &get_gl_debug_vertex_source_for_key(key),
        &get_gl_debug_fragment_source_for_key(key),
    );
    unsafe {
        GlDebugProgram {
            loc_far: gl.get_uniform_location(program, "u_far"),
            loc_near: gl.get_uniform_location(program, "u_near"),
            loc_normal_map: gl.get_uniform_location(program, "u_normalMap"),
            loc_normal_scale: gl.get_uniform_location(program, "u_normalScale"),
            base: GlMeshProgram {
                loc_model: gl.get_uniform_location(program, "u_model"),
                loc_normal_matrix: gl.get_uniform_location(program, "u_normalMatrix"),
                loc_view_projection: gl.get_uniform_location(program, "u_viewProjection"),
                program,
            },
        }
    }
}

/// Resolves the debug program for a define key, compiling on first use.
pub fn ensure_gl_debug_program(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    key: &GlDebugDefineKey,
) -> GlDebugProgram {
    let cache_key = format!("debug:{}", build_gl_debug_define_key(key));
    let _base = ensure_gl_scene_program(state, scene, &cache_key, |gl| {
        let p = compile_gl_debug_program(gl, key);
        p.base.clone()
    });
    if let Some(cached) = scene.debug_program_cache.get(&cache_key) {
        return cached.clone();
    }
    let p = compile_gl_debug_program(&state.gl, key);
    scene.debug_program_cache.insert(cache_key, p.clone());
    p
}

/// Full fragment source for a define key.
pub fn get_gl_debug_fragment_source_for_key(key: &GlDebugDefineKey) -> String {
    format!("{}{}", build_define_source(key), DEBUG_FRAGMENT_BODY)
}

/// Full vertex source for a define key.
pub fn get_gl_debug_vertex_source_for_key(key: &GlDebugDefineKey) -> String {
    format!("{}{}", build_define_source(key), DEBUG_VERTEX_BODY)
}

fn build_define_source(key: &GlDebugDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    match key.mode {
        GlDebugMode::Depth => defines.push_str("#define DEPTH_MODE\n"),
        GlDebugMode::Normal => defines.push_str("#define NORMAL_MODE\n"),
    }
    if key.has_normal_map {
        defines.push_str("#define HAS_NORMAL_MAP\n");
    }
    defines
}

const DEBUG_VERTEX_BODY: &str = r#"
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

const DEBUG_FRAGMENT_BODY: &str = r#"
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

#ifdef DEPTH_MODE
uniform float u_near;
uniform float u_far;
#endif
#ifdef NORMAL_MODE
uniform float u_normalScale;
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif
#endif

out vec4 fragColor;

void main() {
#ifdef DEPTH_MODE
  float eyeDepth = 1.0 / gl_FragCoord.w;
  float d = clamp((eyeDepth - u_near) / max(u_far - u_near, 1e-6), 0.0, 1.0);
  fragColor = vec4(vec3(d), 1.0);
#endif
#ifdef NORMAL_MODE
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

  fragColor = vec4(normal * 0.5 + 0.5, 1.0);
#endif
}
"#;
