use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::{GL_MESH_LIGHT_BLOCK_GLSL, resolve_gl_lit_locations};
use crate::gl_mesh_fragment_tail::{GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS};
use crate::gl_mesh_program::{
    compile_gl_mesh_program, ensure_gl_scene3d_program, GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
    GL_UV_TRANSFORM_VERTEX_GLSL,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlLitProgram, GlMeshProgram, GlPbrDefineKey};

#[derive(Clone)]
pub struct GlPbrProgram {
    pub lit: GlLitProgram,
    pub base_color_location: Option<glow::NativeUniformLocation>,
    pub base_color_map_location: Option<glow::NativeUniformLocation>,
    pub metallic_location: Option<glow::NativeUniformLocation>,
    pub roughness_location: Option<glow::NativeUniformLocation>,
    pub metallic_roughness_map_location: Option<glow::NativeUniformLocation>,
    pub emissive_location: Option<glow::NativeUniformLocation>,
    pub emissive_map_location: Option<glow::NativeUniformLocation>,
    pub occlusion_map_location: Option<glow::NativeUniformLocation>,
    pub normal_map_location: Option<glow::NativeUniformLocation>,
    pub normal_scale_location: Option<glow::NativeUniformLocation>,
    pub ibl_diffuse_location: Option<glow::NativeUniformLocation>,
    pub ibl_specular_location: Option<glow::NativeUniformLocation>,
    pub ibl_brdf_lut_location: Option<glow::NativeUniformLocation>,
    pub ibl_intensity_location: Option<glow::NativeUniformLocation>,
    pub has_base_color_map: bool,
    pub has_metallic_roughness_map: bool,
    pub has_emissive_map: bool,
    pub has_occlusion_map: bool,
    pub has_normal_map: bool,
    pub has_ibl: bool,
}

pub fn build_gl_pbr_define_key(key: &GlPbrDefineKey) -> String {
    return format!(
        "pbr{}{}{}{}{}{}{}{}{}{}",
        if key.has_base_color_map { 'b' } else { '-' },
        if key.has_metallic_roughness_map { 'r' } else { '-' },
        if key.has_normal_map { 'n' } else { '-' },
        if key.has_occlusion_map { 'o' } else { '-' },
        if key.has_emissive_map { 'e' } else { '-' },
        if key.has_ibl { 'i' } else { '-' },
        if key.has_shadow { 'S' } else { '-' },
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.has_skin { 'k' } else { '-' },
        if key.has_instanced { 'I' } else { '-' },
    );
}

pub fn compile_gl_pbr_program(
    gl: &glow::Context,
    key: &GlPbrDefineKey,
    skin_declarations_glsl: &str,
    pbr_extension_vertex_glsl: &str,
    pbr_extension_fragment_glsl: &str,
) -> GlPbrProgram {
    let vertex_source = get_gl_pbr_vertex_source_for_key(
        key,
        skin_declarations_glsl,
        pbr_extension_vertex_glsl,
    );
    let fragment_source =
        get_gl_pbr_fragment_source_for_key(key, pbr_extension_fragment_glsl);
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
        GlPbrProgram {
            base_color_location: gl.get_uniform_location(program, "u_baseColor"),
            base_color_map_location: gl.get_uniform_location(program, "u_baseColorMap"),
            metallic_location: gl.get_uniform_location(program, "u_metallic"),
            roughness_location: gl.get_uniform_location(program, "u_roughness"),
            metallic_roughness_map_location: gl
                .get_uniform_location(program, "u_metallicRoughnessMap"),
            emissive_location: gl.get_uniform_location(program, "u_emissive"),
            emissive_map_location: gl.get_uniform_location(program, "u_emissiveMap"),
            occlusion_map_location: gl.get_uniform_location(program, "u_occlusionMap"),
            normal_map_location: gl.get_uniform_location(program, "u_normalMap"),
            normal_scale_location: gl.get_uniform_location(program, "u_normalScale"),
            ibl_diffuse_location: gl.get_uniform_location(program, "u_iblDiffuse"),
            ibl_specular_location: gl.get_uniform_location(program, "u_iblSpecular"),
            ibl_brdf_lut_location: gl.get_uniform_location(program, "u_iblBrdfLut"),
            ibl_intensity_location: gl.get_uniform_location(program, "u_iblIntensity"),
            has_base_color_map: key.has_base_color_map,
            has_metallic_roughness_map: key.has_metallic_roughness_map,
            has_emissive_map: key.has_emissive_map,
            has_occlusion_map: key.has_occlusion_map,
            has_normal_map: key.has_normal_map,
            has_ibl: key.has_ibl,
            lit,
        }
    };
}

pub fn ensure_gl_pbr_program(
    state: &GlRenderState,
    key: &GlPbrDefineKey,
    pbr_extension_vertex_glsl: &str,
    pbr_extension_fragment_glsl: &str,
) -> GlPbrProgram {
    let full_key = GlPbrDefineKey {
        alpha_mask_enabled: key.alpha_mask_enabled,
        has_alpha_map: key.has_alpha_map,
        has_base_color_map: key.has_base_color_map,
        has_color_adjustment: key.has_color_adjustment,
        has_color_matrix: key.has_color_matrix,
        has_emissive_map: key.has_emissive_map,
        has_instanced: get_gl_scene3d_runtime(state, |rt| rt.active_instanced_run),
        has_metallic_roughness_map: key.has_metallic_roughness_map,
        has_normal_map: key.has_normal_map,
        has_occlusion_map: key.has_occlusion_map,
        has_skin: get_gl_scene3d_runtime(state, |rt| rt.active_skinned_run),
        has_uv_transform: key.has_uv_transform,
        has_ibl: key.has_ibl,
        has_shadow: key.has_shadow,
        extension_define_key: key.extension_define_key.clone(),
        modifier_define_key: key.modifier_define_key.clone(),
    };
    let skin_glsl = get_gl_scene3d_runtime(state, |rt| {
        rt.mesh_skin_feature
            .as_ref()
            .map(|f| f.skin_declarations_glsl.clone())
            .unwrap_or_default()
    });
    let cache_key = format!("pbr:{}", build_gl_pbr_define_key(&full_key));
    let ext_vert = pbr_extension_vertex_glsl.to_string();
    let ext_frag = pbr_extension_fragment_glsl.to_string();
    return ensure_gl_scene3d_program(state, &cache_key, |gl| {
        compile_gl_pbr_program(gl, &full_key, &skin_glsl, &ext_vert, &ext_frag)
    });
}

pub fn get_gl_pbr_vertex_source_for_key(
    key: &GlPbrDefineKey,
    skin_declarations_glsl: &str,
    pbr_extension_vertex_glsl: &str,
) -> String {
    let mut src = build_gl_pbr_define_source(key);
    if key.has_skin {
        src.push_str(skin_declarations_glsl);
    }
    if key.has_instanced {
        src.push_str(GL_INSTANCE_VERTEX_DECLARATIONS_GLSL);
    }
    src.push_str(pbr_extension_vertex_glsl);
    src.push_str(&get_pbr_vertex_body());
    return src;
}

pub fn get_gl_pbr_fragment_source_for_key(
    key: &GlPbrDefineKey,
    pbr_extension_fragment_glsl: &str,
) -> String {
    let mut src = build_gl_pbr_define_source(key);
    src.push_str(pbr_extension_fragment_glsl);
    src.push_str(&get_pbr_fragment_body());
    return src;
}

fn build_gl_pbr_define_source(key: &GlPbrDefineKey) -> String {
    let mut defines = format!("#version 300 es\n#define MAX_FORWARD_LIGHTS {}\n", 8);
    if key.has_base_color_map {
        defines.push_str("#define HAS_BASE_COLOR_MAP\n");
    }
    if key.has_metallic_roughness_map {
        defines.push_str("#define HAS_METALLIC_ROUGHNESS_MAP\n");
    }
    if key.has_normal_map {
        defines.push_str("#define HAS_NORMAL_MAP\n");
    }
    if key.has_occlusion_map {
        defines.push_str("#define HAS_OCCLUSION_MAP\n");
    }
    if key.has_emissive_map {
        defines.push_str("#define HAS_EMISSIVE_MAP\n");
    }
    if key.has_ibl {
        defines.push_str("#define HAS_IBL\n");
    }
    if key.alpha_mask_enabled {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_alpha_map {
        defines.push_str("#define HAS_ALPHA_MAP\n");
    }
    if key.has_shadow {
        defines.push_str("#define HAS_SHADOW\n");
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

fn get_pbr_vertex_body() -> String {
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

fn get_pbr_fragment_body() -> String {
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

uniform vec4 u_baseColor;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_emissive;
uniform float u_normalScale;
uniform float u_alphaCutoff;
uniform vec3 u_cameraPosition;
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

#ifdef HAS_BASE_COLOR_MAP
uniform sampler2D u_baseColorMap;
#endif
#ifdef HAS_METALLIC_ROUGHNESS_MAP
uniform sampler2D u_metallicRoughnessMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif
#ifdef HAS_OCCLUSION_MAP
uniform sampler2D u_occlusionMap;
#endif
#ifdef HAS_EMISSIVE_MAP
uniform sampler2D u_emissiveMap;
#endif
#ifdef HAS_IBL
uniform samplerCube u_iblDiffuse;
uniform samplerCube u_iblSpecular;
uniform sampler2D u_iblBrdfLut;
uniform float u_iblIntensity;
#endif

{GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

const float PI = 3.14159265359;
const float MIN_ROUGHNESS = 0.04;
const vec3 DIELECTRIC_F0 = vec3(0.04);

float distributionGGX(float nDotH, float roughness) {{
  float a = roughness * roughness;
  float a2 = a * a;
  float d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}}

float geometrySmithSchlick(float nDotV, float nDotL, float roughness) {{
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  float ggx1 = nDotV / (nDotV * (1.0 - k) + k);
  float ggx2 = nDotL / (nDotL * (1.0 - k) + k);
  return ggx1 * ggx2;
}}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {{
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 f0, float roughness) {{
  return f0 + (max(vec3(1.0 - roughness), f0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}}

vec3 pbrDirectLight(vec3 lightDir, vec3 lightColor, vec3 normal, vec3 viewDir,
                    vec3 albedo, float metallic, float roughness, vec3 f0) {{
  vec3 halfVec = normalize(viewDir + lightDir);
  float nDotL = max(dot(normal, lightDir), 0.0);
  float nDotV = max(dot(normal, viewDir), 0.001);
  float nDotH = max(dot(normal, halfVec), 0.0);
  float hDotV = max(dot(halfVec, viewDir), 0.0);

  float D = distributionGGX(nDotH, roughness);
  float G = geometrySmithSchlick(nDotV, nDotL, roughness);
  vec3 F = fresnelSchlick(hDotV, f0);

  vec3 specular = (D * G * F) / max(4.0 * nDotV * nDotL, 0.001);
  vec3 kD = (vec3(1.0) - F) * (1.0 - metallic);
  return (kD * albedo / PI + specular) * lightColor * nDotL;
}}

void main() {{
  vec4 baseColor = u_baseColor;
#ifdef HAS_INSTANCES
  baseColor *= v_instanceColor;
#endif
#ifdef HAS_BASE_COLOR_MAP
  vec4 sampledBase = texture(u_baseColorMap, v_uv0);
  baseColor *= sampledBase;
#endif

#ifdef ALPHA_MASK
  if (baseColor.a < u_alphaCutoff) discard;
  baseColor.a = 1.0;
#endif

  float metallic = u_metallic;
  float roughness = u_roughness;
#ifdef HAS_METALLIC_ROUGHNESS_MAP
  vec4 mr = texture(u_metallicRoughnessMap, v_uv0);
  metallic *= mr.b;
  roughness *= mr.g;
#endif
  roughness = clamp(roughness, MIN_ROUGHNESS, 1.0);

  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;
  vec3 tangent = normalize(v_tangent.xyz - geometricNormal * dot(v_tangent.xyz, geometricNormal));
  vec3 bitangent = cross(geometricNormal, tangent) * v_tangent.w;
  mat3 tbn = mat3(tangent, bitangent, geometricNormal);

  vec3 normal = geometricNormal;
#ifdef HAS_NORMAL_MAP
  vec3 tangentNormal = texture(u_normalMap, v_uv0).xyz * 2.0 - 1.0;
  tangentNormal.xy *= u_normalScale;
  normal = normalize(tbn * tangentNormal);
#endif

  /*__PBR_EXTENSION_NORMAL__*/

  vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
  vec3 albedo = baseColor.rgb;
  vec3 f0 = mix(DIELECTRIC_F0, albedo, metallic);

  /*__PBR_EXTENSION_F0__*/

  vec3 radiance = vec3(0.0);

  if (u_directionalCount > 0.5) {{
    vec3 lightDir = normalize(-u_directional.xyz);
    float shadow = sampleDirectionalShadow(v_worldPosition, geometricNormal);
    radiance += pbrDirectLight(lightDir, u_directionalRadiance.rgb, normal, viewDir,
                               albedo, metallic, roughness, f0) * shadow;
  }}

  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {{
    if (i >= u_pointCount) break;
    vec3 toLight = u_pointLights[i * 2 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_pointLights[i * 2 + 1].w) / max(dist2, 1e-4);
    radiance += pbrDirectLight(lightDir, u_pointLights[i * 2 + 1].rgb * atten, normal, viewDir,
                               albedo, metallic, roughness, f0);
  }}

  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {{
    if (i >= u_spotCount) break;
    vec3 toLight = u_spotLights[i * 4 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_spotLights[i * 4 + 1].w) / max(dist2, 1e-4);
    float cone = smoothstep(u_spotLights[i * 4 + 3].y, u_spotLights[i * 4 + 3].x,
                            dot(normalize(u_spotLights[i * 4 + 2].xyz), -lightDir));
    radiance += pbrDirectLight(lightDir, u_spotLights[i * 4 + 1].rgb * atten * cone, normal, viewDir,
                               albedo, metallic, roughness, f0);
  }}

#ifdef HAS_IBL
  float nDotV = max(dot(normal, viewDir), 0.001);
  vec3 F_ibl = fresnelSchlickRoughness(nDotV, f0, roughness);
  vec3 kD_ibl = (vec3(1.0) - F_ibl) * (1.0 - metallic);

  vec3 irradiance = texture(u_iblDiffuse, normal).rgb;
  vec3 diffuseIbl = kD_ibl * albedo * irradiance;

  vec3 reflectDir = reflect(-viewDir, normal);
  float maxLod = 7.0;
  vec3 prefilteredColor = textureLod(u_iblSpecular, reflectDir, roughness * maxLod).rgb;
  vec2 brdfLut = texture(u_iblBrdfLut, vec2(nDotV, roughness)).rg;
  vec3 specularIbl = prefilteredColor * (F_ibl * brdfLut.x + brdfLut.y);

  radiance += (diffuseIbl + specularIbl) * u_iblIntensity;
#endif

  if (u_ambientCount > 0.5) {{
    radiance += albedo * u_ambientRadiance * (1.0 - metallic);
  }}

  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {{
    if (i >= u_hemisphereCount) break;
    float f = 0.5 + 0.5 * dot(normal, u_hemisphereLights[i * 3 + 2].xyz);
    radiance += mix(u_hemisphereLights[i * 3 + 1].rgb, u_hemisphereLights[i * 3 + 0].rgb, f) * albedo * (1.0 - metallic);
  }}

#ifdef HAS_OCCLUSION_MAP
  float ao = texture(u_occlusionMap, v_uv0).r;
  radiance *= ao;
#endif

  vec3 emissive = u_emissive;
#ifdef HAS_EMISSIVE_MAP
  emissive *= texture(u_emissiveMap, v_uv0).rgb;
#endif
  radiance += emissive;

  /*__PBR_EXTENSION_RADIANCE__*/

  fragColor = vec4(radiance, baseColor.a);
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
