use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::{gl_mesh_light_block_glsl, resolve_gl_lit_locations};
use crate::gl_mesh_fragment_tail::{GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS};
use crate::gl_mesh_program::{
    compile_gl_mesh_program, ensure_gl_scene3d_program, GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
    GL_UV_TRANSFORM_VERTEX_GLSL,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlLitProgram, GlMeshProgram, GlShadedDefineKey};

#[derive(Clone)]
pub struct GlShadedProgram {
    pub lit: GlLitProgram,
    pub time_location: Option<glow::NativeUniformLocation>,
}

pub fn build_gl_shaded_cache_key(key: &GlShadedDefineKey, modifier_define_key: &str) -> String {
    return format!("shaded:{}|{}", key.base_flags, modifier_define_key);
}

pub fn compile_gl_shaded_program(
    gl: &glow::Context,
    key: &GlShadedDefineKey,
    skin_declarations_glsl: &str,
) -> GlShadedProgram {
    let define_source = build_gl_shaded_define_source(key);
    let vertex_source = format!(
        "{}{}{}{}",
        define_source,
        if key.base_flags & FLAG_HAS_SKIN != 0 {
            skin_declarations_glsl
        } else {
            ""
        },
        if key.base_flags & FLAG_HAS_INSTANCED != 0 {
            GL_INSTANCE_VERTEX_DECLARATIONS_GLSL
        } else {
            ""
        },
        get_shaded_vertex_body()
    );
    let fragment_source = format!("{}{}", define_source, get_shaded_fragment_body());
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
    return GlShadedProgram {
        time_location: unsafe { gl.get_uniform_location(program, "u_time") },
        lit,
    };
}

pub fn ensure_gl_shaded_program(
    state: &GlRenderState,
    key: &GlShadedDefineKey,
) -> GlShadedProgram {
    let mut flags = key.base_flags;
    if get_gl_scene3d_runtime(state, |rt| rt.active_skinned_run) {
        flags |= FLAG_HAS_SKIN;
    }
    if get_gl_scene3d_runtime(state, |rt| rt.active_instanced_run) {
        flags |= FLAG_HAS_INSTANCED;
    }
    if get_gl_scene3d_runtime(state, |rt| rt.active_color_adjustment_run) {
        flags |= FLAG_HAS_COLOR_ADJUSTMENT;
    }
    if get_gl_scene3d_runtime(state, |rt| rt.active_color_matrix_run) {
        flags |= FLAG_HAS_COLOR_MATRIX;
    }
    let full_key = GlShadedDefineKey {
        base_flags: flags,
        modifier_define_key: key.modifier_define_key.clone(),
    };
    let skin_glsl = get_gl_scene3d_runtime(state, |rt| {
        rt.mesh_skin_feature
            .as_ref()
            .map(|f| f.skin_declarations_glsl.clone())
            .unwrap_or_default()
    });
    let cache_key = build_gl_shaded_cache_key(&full_key, &full_key.modifier_define_key);
    return ensure_gl_scene3d_program(state, &cache_key, |gl| {
        compile_gl_shaded_program(gl, &full_key, &skin_glsl)
    });
}

pub const FLAG_HAS_ALPHA_MASK: u32 = 1 << 0;
pub const FLAG_HAS_DIFFUSE_MAP: u32 = 1 << 1;
pub const FLAG_HAS_SPECULAR_MAP: u32 = 1 << 2;
pub const FLAG_HAS_NORMAL_MAP: u32 = 1 << 3;
pub const FLAG_HAS_UV_TRANSFORM: u32 = 1 << 4;
pub const FLAG_HAS_SKIN: u32 = 1 << 5;
pub const FLAG_HAS_INSTANCED: u32 = 1 << 6;
pub const FLAG_HAS_COLOR_ADJUSTMENT: u32 = 1 << 7;
pub const FLAG_HAS_COLOR_MATRIX: u32 = 1 << 8;

fn build_gl_shaded_define_source(key: &GlShadedDefineKey) -> String {
    let flags = key.base_flags;
    let mut defines = format!("#version 300 es\n#define MAX_FORWARD_LIGHTS {}\n", 8);
    if flags & FLAG_HAS_ALPHA_MASK != 0 {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if flags & FLAG_HAS_DIFFUSE_MAP != 0 {
        defines.push_str("#define HAS_DIFFUSE_MAP\n");
    }
    if flags & FLAG_HAS_SPECULAR_MAP != 0 {
        defines.push_str("#define HAS_SPECULAR_MAP\n");
    }
    if flags & FLAG_HAS_NORMAL_MAP != 0 {
        defines.push_str("#define HAS_NORMAL_MAP\n");
    }
    if flags & FLAG_HAS_UV_TRANSFORM != 0 {
        defines.push_str("#define HAS_UV_TRANSFORM\n");
    }
    if flags & FLAG_HAS_SKIN != 0 {
        defines.push_str("#define HAS_SKIN\n");
    }
    if flags & FLAG_HAS_INSTANCED != 0 {
        defines.push_str("#define HAS_INSTANCES\n");
    }
    if flags & FLAG_HAS_COLOR_MATRIX != 0 {
        defines.push_str("#define HAS_COLOR_MATRIX\n");
    } else if flags & FLAG_HAS_COLOR_ADJUSTMENT != 0 {
        defines.push_str("#define HAS_COLOR_ADJUSTMENT\n");
    }
    return defines;
}

fn get_shaded_vertex_body() -> String {
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
uniform float u_time;
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
  vec2 vertexUv = a_uv0;

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

fn get_shaded_fragment_body() -> String {
    let GL_MESH_LIGHT_BLOCK_GLSL = gl_mesh_light_block_glsl();
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
uniform vec4 u_specular;
uniform float u_shininess;
uniform float u_normalScale;
uniform float u_alphaCutoff;
uniform float u_time;
{GL_MESH_LIGHT_BLOCK_GLSL}

#ifdef HAS_DIFFUSE_MAP
uniform sampler2D u_diffuseMap;
#endif
#ifdef HAS_SPECULAR_MAP
uniform sampler2D u_specularMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif

{GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

float shadedHashNoise(vec2 p) {{
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}}
float shadedValueNoise(vec2 p) {{
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = shadedHashNoise(i + vec2(0.0, 0.0));
  float b = shadedHashNoise(i + vec2(1.0, 0.0));
  float c = shadedHashNoise(i + vec2(0.0, 1.0));
  float d = shadedHashNoise(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}}

vec3 shadeShadedLight(vec3 normal, vec3 lightDir, vec3 lightColor, vec3 diffuseRgb, vec3 specularColor, float shininess) {{
  float nDotL = max(dot(normal, lightDir), 0.0);
  vec3 result = diffuseRgb * nDotL * lightColor;
  if (nDotL > 0.0) {{
    vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
    vec3 halfVec = normalize(lightDir + viewDir);
    float specAngle = max(dot(normal, halfVec), 0.0);
    result += pow(specAngle, max(shininess, 1.0)) * specularColor * lightColor;
  }}
  return result;
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

  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;
  vec3 tangent = normalize(v_tangent.xyz - geometricNormal * dot(v_tangent.xyz, geometricNormal));
  vec3 bitangent = cross(geometricNormal, tangent) * v_tangent.w;
  mat3 tbn = mat3(tangent, bitangent, geometricNormal);

  vec3 normal = geometricNormal;
#ifdef HAS_NORMAL_MAP
  vec3 baseTangentNormal = texture(u_normalMap, v_uv0).xyz * 2.0 - 1.0;
  baseTangentNormal.xy *= u_normalScale;
  normal = normalize(tbn * baseTangentNormal);
#endif

  vec3 specularColor = u_specular.rgb;
#ifdef HAS_SPECULAR_MAP
  specularColor *= texture(u_specularMap, v_uv0).rgb;
#endif
  float shininess = u_shininess;

#ifdef ALPHA_MASK
  if (diffuse.a < u_alphaCutoff) discard;
  diffuse.a = 1.0;
#endif

  vec3 radiance = vec3(0.0);

  if (u_directionalCount > 0.5) {{
    vec3 lightDir = normalize(-u_directional.xyz);
    float shadow = sampleDirectionalShadow(v_worldPosition, geometricNormal);
    radiance += shadeShadedLight(normal, lightDir, u_directionalRadiance.rgb, diffuse.rgb, specularColor, shininess) * shadow;
  }}

  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {{
    if (i >= u_pointCount) break;
    vec3 toLight = u_pointLights[i * 2 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_pointLights[i * 2 + 1].w) / max(dist2, 1e-4);
    radiance += shadeShadedLight(normal, lightDir, u_pointLights[i * 2 + 1].rgb * atten, diffuse.rgb, specularColor, shininess);
  }}

  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {{
    if (i >= u_spotCount) break;
    vec3 toLight = u_spotLights[i * 4 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_spotLights[i * 4 + 1].w) / max(dist2, 1e-4);
    float cone = smoothstep(u_spotLights[i * 4 + 3].y, u_spotLights[i * 4 + 3].x,
                            dot(normalize(u_spotLights[i * 4 + 2].xyz), -lightDir));
    radiance += shadeShadedLight(normal, lightDir, u_spotLights[i * 4 + 1].rgb * atten * cone, diffuse.rgb, specularColor, shininess);
  }}

  if (u_ambientCount > 0.5) {{
    radiance += diffuse.rgb * u_ambientRadiance;
  }}

  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {{
    if (i >= u_hemisphereCount) break;
    float f = 0.5 + 0.5 * dot(normal, u_hemisphereLights[i * 3 + 2].xyz);
    radiance += mix(u_hemisphereLights[i * 3 + 1].rgb, u_hemisphereLights[i * 3 + 0].rgb, f) * diffuse.rgb;
  }}

  vec3 emissive = vec3(0.0);
  radiance += emissive;

  vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);

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
