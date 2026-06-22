//! The shared Gl PBR prelude: the GLSL 300 es vertex + fragment uber-shader for
//! the StandardPbr forward-lit path.
//!
//! Ports `@flighthq/scene-gl` `glPbrPrelude.ts`. One source string is specialized
//! per material at compile time by prepending a define block (see
//! [`GlPbrDefineKey`] / [`build_gl_pbr_define_source`]), so the maps-present /
//! double-sided / alpha-mode variants are `#ifdef` branches of one shader, never
//! separate files.
//!
//! The lighting model is Cook-Torrance: GGX normal distribution, Smith
//! height-correlated visibility, and a Fresnel-Schlick approximation, evaluated
//! over the interpolated world-space normal/tangent/uv for one directional + one
//! ambient light read from the packed light block. The fragment shader outputs
//! LINEAR HDR radiance (no tonemap / gamma here — the effect pipeline's
//! resolve/tonemap pass owns that), matching the rgba16f scene target.

/// The feature flags that select an uber-shader variant. Each toggles an `#ifdef`
/// in the prelude and is hashed into the program-cache key
/// ([`build_gl_pbr_define_key`]), so distinct flag sets compile and cache as
/// distinct programs. `has_base_color_map` / `has_normal_map` enable the textured
/// paths; `alpha_mask_enabled` enables the alpha-cutoff discard for `mask`
/// materials.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub struct GlPbrDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_base_color_map: bool,
    pub has_normal_map: bool,
}

/// A short, stable, order-independent string identity for a define key, used as
/// the program-cache map key. Two keys with the same flags produce the same
/// string and so share a compiled program.
pub fn build_gl_pbr_define_key(key: &GlPbrDefineKey) -> String {
    let m = if key.alpha_mask_enabled { 'm' } else { '-' };
    let b = if key.has_base_color_map { 'b' } else { '-' };
    let n = if key.has_normal_map { 'n' } else { '-' };
    format!("{m}{b}{n}")
}

/// Builds the leading `"#version 300 es\n#define ..."` block for a define key, to
/// be prepended to the vertex and fragment prelude bodies before compile. Pure
/// string assembly; the same key always yields the same source, which is what
/// makes the program cache by define key sound.
pub fn build_gl_pbr_define_source(key: &GlPbrDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.alpha_mask_enabled {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_base_color_map {
        defines.push_str("#define HAS_BASE_COLOR_MAP\n");
    }
    if key.has_normal_map {
        defines.push_str("#define HAS_NORMAL_MAP\n");
    }
    defines
}

/// The fragment shader body (everything after the `"#version 300 es"` + defines
/// block). Implements Cook-Torrance GGX/Smith/Fresnel-Schlick over one
/// directional + one ambient light and writes linear HDR radiance to `fragColor`.
pub fn get_gl_pbr_fragment_source() -> &'static str {
    PBR_FRAGMENT_BODY
}

/// The full fragment source for a define key (define block + body), ready to hand
/// to the GL compiler. Convenience over [`build_gl_pbr_define_source`] +
/// [`get_gl_pbr_fragment_source`].
pub fn get_gl_pbr_fragment_source_for_key(key: &GlPbrDefineKey) -> String {
    build_gl_pbr_define_source(key) + PBR_FRAGMENT_BODY
}

/// The vertex shader body (everything after the `"#version 300 es"` + defines
/// block). Transforms the canonical PBR vertex record (position/normal/tangent/
/// uv0) by the model and view-projection matrices and passes world-space
/// position, normal, tangent, and uv to the fragment stage.
pub fn get_gl_pbr_vertex_source() -> &'static str {
    PBR_VERTEX_BODY
}

/// The full vertex source for a define key (define block + body), ready to hand
/// to the GL compiler.
pub fn get_gl_pbr_vertex_source_for_key(key: &GlPbrDefineKey) -> String {
    build_gl_pbr_define_source(key) + PBR_VERTEX_BODY
}

const PBR_VERTEX_BODY: &str = r#"
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

const PBR_FRAGMENT_BODY: &str = r#"
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

uniform vec4 u_baseColor;
uniform float u_metallic;
uniform float u_roughness;
uniform float u_normalScale;
uniform vec3 u_emissive;
uniform float u_emissiveStrength;
uniform float u_alphaCutoff;
uniform vec3 u_cameraPosition;

uniform vec4 u_directional;
uniform vec4 u_directionalRadiance;
uniform vec3 u_ambientRadiance;
uniform float u_directionalCount;
uniform float u_ambientCount;

#ifdef HAS_BASE_COLOR_MAP
uniform sampler2D u_baseColorMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif

out vec4 fragColor;

const float PI = 3.14159265359;

// sRgb albedo texels are gamma-encoded; decode to linear before lighting.
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

float distributionGgx(float nDotH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

float visibilitySmith(float nDotV, float nDotL, float roughness) {
  float a = roughness * roughness;
  float k = a * 0.5;
  float gv = nDotV / (nDotV * (1.0 - k) + k);
  float gl = nDotL / (nDotL * (1.0 - k) + k);
  return gv * gl;
}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
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

  vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
  float nDotV = max(dot(normal, viewDir), 1e-4);

  float roughness = clamp(u_roughness, 0.04, 1.0);
  float metallic = clamp(u_metallic, 0.0, 1.0);
  vec3 albedo = baseColor.rgb;
  vec3 f0 = mix(vec3(0.04), albedo, metallic);
  vec3 diffuseColor = albedo * (1.0 - metallic);

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    vec3 halfVec = normalize(viewDir + lightDir);
    float nDotL = max(dot(normal, lightDir), 0.0);
    float nDotH = max(dot(normal, halfVec), 0.0);
    float vDotH = max(dot(viewDir, halfVec), 0.0);

    float d = distributionGgx(nDotH, roughness);
    float vis = visibilitySmith(nDotV, nDotL, roughness);
    vec3 fresnel = fresnelSchlick(vDotH, f0);

    vec3 specular = d * vis * fresnel;
    vec3 kd = (1.0 - fresnel) * (1.0 - metallic);
    vec3 brdf = kd * diffuseColor / PI + specular;
    radiance += brdf * u_directionalRadiance.rgb * nDotL;
  }

  // Ambient term: flat irradiance over the diffuse albedo (no IBL specular yet).
  if (u_ambientCount > 0.5) {
    radiance += diffuseColor * u_ambientRadiance;
  }

  radiance += u_emissive * u_emissiveStrength;

  fragColor = vec4(radiance, baseColor.a);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    const NONE: GlPbrDefineKey = GlPbrDefineKey {
        alpha_mask_enabled: false,
        has_base_color_map: false,
        has_normal_map: false,
    };
    const ALL: GlPbrDefineKey = GlPbrDefineKey {
        alpha_mask_enabled: true,
        has_base_color_map: true,
        has_normal_map: true,
    };

    // build_gl_pbr_define_key

    #[test]
    fn build_gl_pbr_define_key_produces_a_stable_distinct_string_per_flag_set() {
        assert_eq!(build_gl_pbr_define_key(&NONE), "---");
        assert_eq!(build_gl_pbr_define_key(&ALL), "mbn");
        assert_eq!(
            build_gl_pbr_define_key(&GlPbrDefineKey {
                alpha_mask_enabled: false,
                has_base_color_map: true,
                has_normal_map: false,
            }),
            "-b-"
        );
    }

    #[test]
    fn build_gl_pbr_define_key_is_identical_for_equal_flag_sets() {
        assert_eq!(build_gl_pbr_define_key(&ALL), build_gl_pbr_define_key(&ALL));
    }

    // build_gl_pbr_define_source

    #[test]
    fn build_gl_pbr_define_source_opens_with_the_glsl_300_es_version_directive() {
        assert!(build_gl_pbr_define_source(&NONE).starts_with("#version 300 es"));
    }

    #[test]
    fn build_gl_pbr_define_source_emits_a_define_for_each_enabled_flag_and_none_for_disabled() {
        let all = build_gl_pbr_define_source(&ALL);
        assert!(all.contains("#define ALPHA_MASK"));
        assert!(all.contains("#define HAS_BASE_COLOR_MAP"));
        assert!(all.contains("#define HAS_NORMAL_MAP"));

        let none = build_gl_pbr_define_source(&NONE);
        assert!(!none.contains("#define ALPHA_MASK"));
        assert!(!none.contains("#define HAS_BASE_COLOR_MAP"));
        assert!(!none.contains("#define HAS_NORMAL_MAP"));
    }

    // get_gl_pbr_fragment_source

    #[test]
    fn get_gl_pbr_fragment_source_declares_the_pbr_fragment_interface_and_outputs_linear_hdr() {
        let src = get_gl_pbr_fragment_source();
        assert!(src.contains("out vec4 fragColor"));
        assert!(src.contains("distributionGgx"));
        assert!(src.contains("fresnelSchlick"));
        assert!(src.contains("u_directionalRadiance"));
    }

    #[test]
    fn get_gl_pbr_fragment_source_does_not_embed_a_version_directive() {
        assert!(!get_gl_pbr_fragment_source().contains("#version"));
    }

    // get_gl_pbr_fragment_source_for_key

    #[test]
    fn get_gl_pbr_fragment_source_for_key_prepends_the_define_block_to_the_fragment_body() {
        let src = get_gl_pbr_fragment_source_for_key(&ALL);
        assert!(src.starts_with("#version 300 es"));
        assert!(src.contains("#define HAS_NORMAL_MAP"));
        assert!(src.contains("out vec4 fragColor"));
    }

    // get_gl_pbr_vertex_source

    #[test]
    fn get_gl_pbr_vertex_source_declares_the_canonical_attributes_and_uniforms() {
        let src = get_gl_pbr_vertex_source();
        assert!(src.contains("layout(location = 0) in vec3 a_position"));
        assert!(src.contains("layout(location = 1) in vec3 a_normal"));
        assert!(src.contains("layout(location = 2) in vec4 a_tangent"));
        assert!(src.contains("layout(location = 3) in vec2 a_uv0"));
        assert!(src.contains("u_viewProjection"));
        assert!(src.contains("u_model"));
        assert!(src.contains("u_normalMatrix"));
    }

    // get_gl_pbr_vertex_source_for_key

    #[test]
    fn get_gl_pbr_vertex_source_for_key_prepends_the_define_block_to_the_vertex_body() {
        let src = get_gl_pbr_vertex_source_for_key(&NONE);
        assert!(src.starts_with("#version 300 es"));
        assert!(src.contains("gl_Position"));
    }
}
