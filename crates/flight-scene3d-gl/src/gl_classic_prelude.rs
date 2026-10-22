use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::{GL_MESH_LIGHT_BLOCK_GLSL, resolve_gl_lit_locations};
use crate::gl_mesh_fragment_tail::{GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS};
use crate::gl_mesh_program::{
    compile_gl_mesh_program, ensure_gl_scene3d_program, GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
    GL_UV_TRANSFORM_VERTEX_GLSL,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlClassicDefineKey, GlClassicProgram, GlLitProgram, GlMeshProgram};

pub fn build_gl_classic_define_key(key: &GlClassicDefineKey) -> String {
    return format!(
        "l{}{}{}{}",
        if key.has_alpha_mask { 'm' } else { '-' },
        if key.has_diffuse_map { 'd' } else { '-' },
        if key.has_skin { 'k' } else { '-' },
        if key.has_instanced { 'i' } else { '-' },
    );
}

pub fn compile_gl_classic_program(
    gl: &glow::Context,
    key: &GlClassicDefineKey,
    skin_declarations_glsl: &str,
) -> GlClassicProgram {
    let vertex_source = get_gl_classic_vertex_source_for_key(key, skin_declarations_glsl);
    let fragment_source = get_gl_classic_fragment_source_for_key(key);
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
    return GlClassicProgram {
        diffuse_color_location: unsafe { gl.get_uniform_location(program, "u_diffuse") },
        diffuse_map_location: unsafe { gl.get_uniform_location(program, "u_diffuseMap") },
        has_diffuse_map: key.has_diffuse_map,
        lit,
    };
}

pub fn ensure_gl_classic_program(
    state: &GlRenderState,
    key: &GlClassicDefineKey,
) -> GlClassicProgram {
    let full_key = GlClassicDefineKey {
        has_diffuse_map: key.has_diffuse_map,
        has_skin: get_gl_scene3d_runtime(state, |rt| rt.active_skinned_run),
        has_color_adjustment: get_gl_scene3d_runtime(state, |rt| rt.active_color_adjustment_run),
        has_color_matrix: get_gl_scene3d_runtime(state, |rt| rt.active_color_matrix_run),
        has_alpha_mask: key.has_alpha_mask,
        has_instanced: get_gl_scene3d_runtime(state, |rt| rt.active_instanced_run),
    };
    let skin_glsl = get_gl_scene3d_runtime(state, |rt| {
        rt.mesh_skin_feature
            .as_ref()
            .map(|f| f.skin_declarations_glsl.clone())
            .unwrap_or_default()
    });
    let cache_key = format!("classic:{}", build_gl_classic_define_key(&full_key));
    return ensure_gl_scene3d_program(state, &cache_key, |gl| {
        compile_gl_classic_program(gl, &full_key, &skin_glsl)
    });
}

pub fn get_gl_classic_fragment_source_for_key(key: &GlClassicDefineKey) -> String {
    let mut src = build_gl_classic_define_source(key);
    src.push_str(&get_classic_fragment_body());
    return src;
}

pub fn get_gl_classic_vertex_source_for_key(
    key: &GlClassicDefineKey,
    skin_declarations_glsl: &str,
) -> String {
    let mut src = build_gl_classic_define_source(key);
    if key.has_skin {
        src.push_str(skin_declarations_glsl);
    }
    if key.has_instanced {
        src.push_str(GL_INSTANCE_VERTEX_DECLARATIONS_GLSL);
    }
    src.push_str(&get_classic_vertex_body());
    return src;
}

fn build_gl_classic_define_source(key: &GlClassicDefineKey) -> String {
    let mut defines = format!("#version 300 es\n#define MAX_FORWARD_LIGHTS {}\n", 8);
    if key.has_alpha_mask {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_diffuse_map {
        defines.push_str("#define HAS_DIFFUSE_MAP\n");
    }
    if key.has_skin {
        defines.push_str("#define HAS_SKIN\n");
    }
    if key.has_instanced {
        defines.push_str("#define HAS_INSTANCES\n");
    }
    if key.has_color_matrix {
        defines.push_str("#define HAS_COLOR_MATRIX\n");
    } else if key.has_color_adjustment {
        defines.push_str("#define HAS_COLOR_ADJUSTMENT\n");
    }
    return defines;
}

fn get_classic_vertex_body() -> String {
    return format!(
        r#"#ifdef HAS_INSTANCES
flat out vec4 v_instanceColor;
#endif

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
{GL_UV_TRANSFORM_VERTEX_GLSL}
out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;

void main() {{
#ifdef HAS_INSTANCES
  v_instanceColor = instanceColor();
#endif
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
  v_uv0 = applyUvTransform(a_uv0);
  gl_Position = u_viewProjection * worldPosition;
}}
"#
    );
}

fn get_classic_fragment_body() -> String {
    return format!(
        r#"
precision highp float;
#ifdef HAS_INSTANCES
flat in vec4 v_instanceColor;
#endif

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

uniform vec4 u_diffuse;
uniform float u_alphaCutoff;
#ifdef HAS_COLOR_MATRIX
uniform vec4 u_flightColorMatrix0;
uniform vec4 u_flightColorMatrix1;
uniform vec4 u_flightColorMatrix2;
uniform vec4 u_flightColorMatrix3;
uniform vec4 u_flightColorMatrixOffset;
#elif defined(HAS_COLOR_ADJUSTMENT)
uniform vec4 u_flightColorScale;
uniform vec4 u_flightColorBias;
#endif
{GL_MESH_LIGHT_BLOCK_GLSL}

#ifdef HAS_DIFFUSE_MAP
uniform sampler2D u_diffuseMap;
#endif

{GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

vec3 shadeClassicLight(vec3 normal, vec3 lightDir, vec3 lightColor, vec3 diffuseRgb) {{
  float nDotL = max(dot(normal, lightDir), 0.0);
  return diffuseRgb * nDotL * lightColor;
}}

void main() {{
  vec4 diffuse = u_diffuse;
#ifdef HAS_INSTANCES
  diffuse *= v_instanceColor;
#endif
#ifdef HAS_DIFFUSE_MAP
  vec4 sampledDiffuse = texture(u_diffuseMap, v_uv0);
  diffuse.rgb *= sampledDiffuse.rgb;
  diffuse.a *= sampledDiffuse.a;
#endif

#ifdef ALPHA_MASK
  if (diffuse.a < u_alphaCutoff) discard;
  diffuse.a = 1.0;
#endif

  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;

  vec3 normal = geometricNormal;

  vec3 radiance = vec3(0.0);

  if (u_directionalCount > 0.5) {{
    vec3 lightDir = normalize(-u_directional.xyz);
    radiance += shadeClassicLight(normal, lightDir, u_directionalRadiance.rgb, diffuse.rgb)
                * sampleDirectionalShadow(v_worldPosition, geometricNormal);
  }}

  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {{
    if (i >= u_pointCount) break;
    vec3 toLight = u_pointLights[i * 2 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_pointLights[i * 2 + 1].w) / max(dist2, 1e-4);
    radiance += shadeClassicLight(normal, lightDir, u_pointLights[i * 2 + 1].rgb * atten, diffuse.rgb);
  }}

  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {{
    if (i >= u_spotCount) break;
    vec3 toLight = u_spotLights[i * 4 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_spotLights[i * 4 + 1].w) / max(dist2, 1e-4);
    float cone = smoothstep(u_spotLights[i * 4 + 3].y, u_spotLights[i * 4 + 3].x,
                            dot(normalize(u_spotLights[i * 4 + 2].xyz), -lightDir));
    radiance += shadeClassicLight(normal, lightDir, u_spotLights[i * 4 + 1].rgb * atten * cone, diffuse.rgb);
  }}

  if (u_ambientCount > 0.5) {{
    radiance += diffuse.rgb * u_ambientRadiance;
  }}

  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {{
    if (i >= u_hemisphereCount) break;
    float f = 0.5 + 0.5 * dot(normal, u_hemisphereLights[i * 3 + 2].xyz);
    radiance += mix(u_hemisphereLights[i * 3 + 1].rgb, u_hemisphereLights[i * 3 + 0].rgb, f) * diffuse.rgb;
  }}

  fragColor = vec4(radiance, diffuse.a);
#ifdef HAS_COLOR_MATRIX
  fragColor = applyFlightColorMatrix(fragColor, u_flightColorMatrix0, u_flightColorMatrix1,
    u_flightColorMatrix2, u_flightColorMatrix3, u_flightColorMatrixOffset);
#elif defined(HAS_COLOR_ADJUSTMENT)
  fragColor = applyFlightColorAdjustment(fragColor, u_flightColorScale, u_flightColorBias);
#endif
{GL_MESH_FRAGMENT_TAIL}
}}
"#
    );
}
