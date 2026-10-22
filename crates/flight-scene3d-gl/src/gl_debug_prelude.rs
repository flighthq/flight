use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_fragment_tail::{GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS};
use crate::gl_mesh_program::{
    compile_gl_mesh_program, ensure_gl_scene3d_program, GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlDebugDefineKey, GlDebugMode, GlDebugProgram, GlMeshProgram};

pub fn build_gl_debug_define_key(key: &GlDebugDefineKey) -> String {
    return format!(
        "{}{}{}{}",
        match key.mode {
            GlDebugMode::Depth => 'd',
            GlDebugMode::Normal => 'n',
        },
        if key.has_normal_map { 'N' } else { '-' },
        if key.has_skin { 'k' } else { '-' },
        if key.has_instanced { 'i' } else { '-' },
    );
}

pub fn compile_gl_debug_program(
    gl: &glow::Context,
    key: &GlDebugDefineKey,
    skin_declarations_glsl: &str,
) -> GlDebugProgram {
    let vertex_source = get_gl_debug_vertex_source_for_key(key, skin_declarations_glsl);
    let fragment_source = get_gl_debug_fragment_source_for_key(key);
    let program = compile_gl_mesh_program(gl, &vertex_source, &fragment_source).unwrap();
    let base = unsafe {
        GlMeshProgram {
            program,
            model_location: gl.get_uniform_location(program, "u_model"),
            view_projection_location: gl.get_uniform_location(program, "u_viewProjection"),
            normal_matrix_location: gl.get_uniform_location(program, "u_normalMatrix"),
            camera_position_location: None,
            object_alpha_location: gl.get_uniform_location(program, "u_objectAlpha"),
            alpha_is_coverage_location: gl.get_uniform_location(program, "u_alphaIsCoverage"),
        }
    };
    return unsafe {
        GlDebugProgram {
            far_location: gl.get_uniform_location(program, "u_far"),
            near_location: gl.get_uniform_location(program, "u_near"),
            normal_map_location: gl.get_uniform_location(program, "u_normalMap"),
            normal_scale_location: gl.get_uniform_location(program, "u_normalScale"),
            view_location: gl.get_uniform_location(program, "u_view"),
            base,
        }
    };
}

pub fn ensure_gl_debug_program(
    state: &GlRenderState,
    key: &GlDebugDefineKey,
) -> GlDebugProgram {
    let full_key = GlDebugDefineKey {
        mode: key.mode,
        has_normal_map: key.has_normal_map,
        has_instanced: get_gl_scene3d_runtime(state, |rt| rt.active_instanced_run),
        has_skin: get_gl_scene3d_runtime(state, |rt| rt.active_skinned_run),
    };
    let skin_glsl = get_gl_scene3d_runtime(state, |rt| {
        rt.mesh_skin_feature
            .as_ref()
            .map(|f| f.skin_declarations_glsl.clone())
            .unwrap_or_default()
    });
    let cache_key = format!("debug:{}", build_gl_debug_define_key(&full_key));
    return ensure_gl_scene3d_program(state, &cache_key, |gl| {
        compile_gl_debug_program(gl, &full_key, &skin_glsl)
    });
}

pub fn get_gl_debug_fragment_source_for_key(key: &GlDebugDefineKey) -> String {
    let mut src = build_define_source(key);
    src.push_str(&get_debug_fragment_body());
    return src;
}

pub fn get_gl_debug_vertex_source_for_key(
    key: &GlDebugDefineKey,
    skin_declarations_glsl: &str,
) -> String {
    let mut src = build_define_source(key);
    if key.has_skin {
        src.push_str(skin_declarations_glsl);
    }
    if key.has_instanced {
        src.push_str(GL_INSTANCE_VERTEX_DECLARATIONS_GLSL);
    }
    src.push_str(DEBUG_VERTEX_BODY);
    return src;
}

fn build_define_source(key: &GlDebugDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.mode == GlDebugMode::Depth {
        defines.push_str("#define DEPTH_MODE\n");
    } else {
        defines.push_str("#define NORMAL_MODE\n");
    }
    if key.has_normal_map {
        defines.push_str("#define HAS_NORMAL_MAP\n");
    }
    if key.has_skin {
        defines.push_str("#define HAS_SKIN\n");
    }
    if key.has_instanced {
        defines.push_str("#define HAS_INSTANCES\n");
    }
    return defines;
}

fn get_debug_fragment_body() -> String {
    return format!(
        r#"
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

#ifdef DEPTH_MODE
in float v_viewDepth;
uniform float u_near;
uniform float u_far;
#endif
#ifdef NORMAL_MODE
uniform float u_normalScale;
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif
#endif

{GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

void main() {{
#ifdef DEPTH_MODE
  float d = clamp((v_viewDepth - u_near) / max(u_far - u_near, 1e-6), 0.0, 1.0);
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
{GL_MESH_FRAGMENT_TAIL}
}}
"#
    );
}

const DEBUG_VERTEX_BODY: &str = r#"
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
#ifdef DEPTH_MODE
uniform mat4 u_view;
#endif

out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;
#ifdef DEPTH_MODE
out float v_viewDepth;
#endif

void main() {
#ifdef HAS_SKIN
  mat4 skin = skinMatrix();
  vec4 localPosition = skin * vec4(a_position, 1.0);
  vec3 localNormal = skinNormalMatrix() * a_normal;
  vec3 localTangent = mat3(skin) * a_tangent.xyz;
#else
  vec4 localPosition = vec4(a_position, 1.0);
  vec3 localNormal = a_normal;
  vec3 localTangent = a_tangent.xyz;
#endif
#ifdef HAS_INSTANCES
  mat4 instanceModel = u_model * instanceModelMatrix();
  vec4 worldPosition = instanceModel * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = mat3(instanceModel) * localNormal;
  mat3 modelRotation = mat3(instanceModel);
#else
  vec4 worldPosition = u_model * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * localNormal;
  mat3 modelRotation = mat3(u_model);
#endif
  float tangentHandedness = a_tangent.w * (determinant(modelRotation) < 0.0 ? -1.0 : 1.0);
  v_tangent = vec4(modelRotation * localTangent, tangentHandedness);
  v_uv0 = a_uv0;
#ifdef DEPTH_MODE
  v_viewDepth = -(u_view * worldPosition).z;
#endif
  gl_Position = u_viewProjection * worldPosition;
}
"#;
