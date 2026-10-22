use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::{gl_mesh_light_block_glsl, resolve_gl_lit_locations};
use crate::gl_mesh_fragment_tail::{GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS};
use crate::gl_mesh_program::{
    compile_gl_mesh_program, ensure_gl_scene3d_program, GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
    GL_UV_TRANSFORM_VERTEX_GLSL,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlLitProgram, GlMeshProgram, GlToonDefineKey, GlToonProgram};

pub fn build_gl_toon_define_key(key: &GlToonDefineKey) -> String {
    return format!(
        "{}{}{}{}{}",
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.has_base_color_map { 'b' } else { '-' },
        if key.has_ramp { 'r' } else { '-' },
        if key.has_skin { 'k' } else { '-' },
        if key.has_instanced { 'i' } else { '-' },
    );
}

fn build_gl_toon_define_source(key: &GlToonDefineKey) -> String {
    let mut defines = format!("#version 300 es\n#define MAX_FORWARD_LIGHTS {}\n", 8);
    if key.alpha_mask_enabled {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_base_color_map {
        defines.push_str("#define HAS_BASE_COLOR_MAP\n");
    }
    if key.has_ramp {
        defines.push_str("#define HAS_RAMP\n");
    }
    if key.has_skin {
        defines.push_str("#define HAS_SKIN\n");
    }
    if key.has_instanced {
        defines.push_str("#define HAS_INSTANCES\n");
    }
    return defines;
}

pub fn compile_gl_toon_program(
    gl: &glow::Context,
    key: &GlToonDefineKey,
    skin_declarations_glsl: &str,
) -> GlToonProgram {
    let vertex_source = get_gl_toon_vertex_source_for_key(key, skin_declarations_glsl);
    let fragment_source = get_gl_toon_fragment_source_for_key(key);
    let program = compile_gl_mesh_program(gl, &vertex_source, &fragment_source).unwrap();
    let base = unsafe {
        GlMeshProgram {
            program,
            model_location: gl.get_uniform_location(program, "u_model"),
            view_projection_location: gl.get_uniform_location(program, "u_viewProjection"),
            normal_matrix_location: gl.get_uniform_location(program, "u_normalMatrix"),
            camera_position_location: gl.get_uniform_location(program, "u_cameraPosition"),
            object_alpha_location: gl.get_uniform_location(program, "u_objectAlpha"),
            alpha_is_coverage_location: gl.get_uniform_location(program, "u_alphaIsCoverage"),
        }
    };
    let lit = GlLitProgram {
        base,
        ..resolve_gl_lit_locations(gl, program)
    };
    return unsafe {
        GlToonProgram {
            alpha_cutoff_location: gl.get_uniform_location(program, "u_alphaCutoff"),
            base_color_location: gl.get_uniform_location(program, "u_baseColor"),
            base_color_map_location: gl.get_uniform_location(program, "u_baseColorMap"),
            ramp_location: gl.get_uniform_location(program, "u_ramp"),
            steps_location: gl.get_uniform_location(program, "u_steps"),
            lit,
        }
    };
}

pub fn ensure_gl_toon_program(
    state: &GlRenderState,
    key: &GlToonDefineKey,
) -> GlToonProgram {
    let full_key = GlToonDefineKey {
        alpha_mask_enabled: key.alpha_mask_enabled,
        has_base_color_map: key.has_base_color_map,
        has_ramp: key.has_ramp,
        has_skin: get_gl_scene3d_runtime(state, |rt| rt.active_skinned_run),
        has_instanced: get_gl_scene3d_runtime(state, |rt| rt.active_instanced_run),
        has_uv_transform: key.has_uv_transform,
    };
    let skin_glsl = get_gl_scene3d_runtime(state, |rt| {
        rt.mesh_skin_feature
            .as_ref()
            .map(|f| f.skin_declarations_glsl.clone())
            .unwrap_or_default()
    });
    let cache_key = format!("toon:{}", build_gl_toon_define_key(&full_key));
    return ensure_gl_scene3d_program(state, &cache_key, |gl| {
        compile_gl_toon_program(gl, &full_key, &skin_glsl)
    });
}

pub fn get_gl_toon_fragment_source_for_key(key: &GlToonDefineKey) -> String {
    let mut src = build_gl_toon_define_source(key);
    src.push_str(&get_toon_fragment_body());
    return src;
}

pub fn get_gl_toon_vertex_source_for_key(
    key: &GlToonDefineKey,
    skin_declarations_glsl: &str,
) -> String {
    let mut src = build_gl_toon_define_source(key);
    if key.has_skin {
        src.push_str(skin_declarations_glsl);
    }
    if key.has_instanced {
        src.push_str(GL_INSTANCE_VERTEX_DECLARATIONS_GLSL);
    }
    src.push_str(&get_toon_vertex_body());
    return src;
}

fn get_toon_fragment_body() -> String {
    let GL_MESH_LIGHT_BLOCK_GLSL = gl_mesh_light_block_glsl();
    return format!(
        r#"
precision highp float;
#ifdef HAS_INSTANCES
flat in vec4 v_instanceColor;
#endif

in vec3 v_worldPosition;
in vec3 v_normal;
in vec2 v_uv0;

uniform vec4 u_baseColor;
uniform float u_steps;
uniform float u_alphaCutoff;
{GL_MESH_LIGHT_BLOCK_GLSL}
#ifdef HAS_BASE_COLOR_MAP
uniform sampler2D u_baseColorMap;
#endif
#ifdef HAS_RAMP
uniform sampler2D u_ramp;
#endif

{GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

void main() {{
  vec4 baseColor = u_baseColor;
#ifdef HAS_INSTANCES
  baseColor *= v_instanceColor;
#endif
#ifdef HAS_BASE_COLOR_MAP
  vec4 sampled = texture(u_baseColorMap, v_uv0);
  baseColor.rgb *= sampled.rgb;
  baseColor.a *= sampled.a;
#endif

#ifdef ALPHA_MASK
  if (baseColor.a < u_alphaCutoff) discard;
  baseColor.a = 1.0;
#endif

  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;

  vec3 radiance = vec3(0.0);

  if (u_directionalCount > 0.5) {{
    vec3 lightDir = normalize(-u_directional.xyz);
    float nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
#ifdef HAS_RAMP
    vec3 band = texture(u_ramp, vec2(nDotL, 0.5)).rgb;
    vec3 direct = baseColor.rgb * band * u_directionalRadiance.rgb;
#else
    float band = floor(nDotL * u_steps) / max(u_steps, 1.0);
    vec3 direct = baseColor.rgb * band * u_directionalRadiance.rgb;
#endif
    radiance += direct * sampleDirectionalShadow(v_worldPosition, normal);
  }}

  if (u_ambientCount > 0.5) {{
    radiance += baseColor.rgb * u_ambientRadiance;
  }}

  fragColor = vec4(radiance, baseColor.a);
{GL_MESH_FRAGMENT_TAIL}
}}
"#
    );
}

fn get_toon_vertex_body() -> String {
    return format!(
        r#"#ifdef HAS_INSTANCES
flat out vec4 v_instanceColor;
#endif

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
{GL_UV_TRANSFORM_VERTEX_GLSL}
out vec3 v_worldPosition;
out vec3 v_normal;
out vec2 v_uv0;

void main() {{
#ifdef HAS_INSTANCES
  v_instanceColor = instanceColor();
#endif
#ifdef HAS_SKIN
  mat4 skin = skinMatrix();
  vec4 localPosition = skin * vec4(a_position, 1.0);
  vec3 localNormal = skinNormalMatrix() * a_normal;
#else
  vec4 localPosition = vec4(a_position, 1.0);
  vec3 localNormal = a_normal;
#endif
#ifdef HAS_INSTANCES
  mat4 instanceModel = u_model * instanceModelMatrix();
  vec4 worldPosition = instanceModel * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = mat3(instanceModel) * localNormal;
#else
  vec4 worldPosition = u_model * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * localNormal;
#endif
  v_uv0 = applyUvTransform(a_uv0);
  gl_Position = u_viewProjection * worldPosition;
}}
"#
    );
}
