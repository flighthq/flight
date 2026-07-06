//! The shared Gl PBR prelude: the GLSL 300 es vertex + fragment uber-shader for
//! the StandardPbr forward-lit path and every PBR-extension variant.
//!
//! Ports `@flighthq/scene-gl` `glPbrPrelude.ts`. One source string is specialized
//! per material at compile time by prepending a define block (see
//! [`GlPbrDefineKey`] / [`build_gl_pbr_define_source`]), so the maps-present /
//! double-sided / alpha-mode variants AND the extension lobes (clearcoat, sheen,
//! anisotropy, iridescence, specular, subsurface, transmission) are all `#ifdef`
//! branches of one shader, never separate files. An extension renderer sets exactly
//! one extension define on top of the standard map flags drawn from
//! `material.standard`, so the base StandardPbr path is byte-for-byte unchanged when
//! no extension flag is set.
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
/// distinct programs. The `has_*_map` flags enable the textured paths of the
/// standard block; `alpha_mask_enabled` enables the alpha-cutoff discard for `mask`
/// materials. The extension flags (`clearcoat_enabled` … `transmission_enabled`)
/// each enable one extension lobe; an extension renderer sets exactly one. Map
/// flags inside an extension's own textures are not part of the key today —
/// extension maps are bound when present and the lobe reads a uniform fallback
/// otherwise.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub struct GlPbrDefineKey {
    pub alpha_mask_enabled: bool,
    pub anisotropy_enabled: bool,
    pub clearcoat_enabled: bool,
    pub has_base_color_map: bool,
    pub has_emissive_map: bool,
    pub has_metallic_roughness_map: bool,
    pub has_normal_map: bool,
    pub has_occlusion_map: bool,
    pub iridescence_enabled: bool,
    pub sheen_enabled: bool,
    pub specular_enabled: bool,
    pub subsurface_enabled: bool,
    pub transmission_enabled: bool,
}

/// A short, stable, order-independent string identity for a define key, used as
/// the program-cache map key. Two keys with the same flags produce the same
/// string and so share a compiled program. Standard map/alpha flags first, then
/// one slot per extension lobe.
pub fn build_gl_pbr_define_key(key: &GlPbrDefineKey) -> String {
    let m = if key.alpha_mask_enabled { 'm' } else { '-' };
    let b = if key.has_base_color_map { 'b' } else { '-' };
    let n = if key.has_normal_map { 'n' } else { '-' };
    let r = if key.has_metallic_roughness_map {
        'r'
    } else {
        '-'
    };
    let o = if key.has_occlusion_map { 'o' } else { '-' };
    let e = if key.has_emissive_map { 'e' } else { '-' };
    let cc = if key.clearcoat_enabled { 'C' } else { '-' };
    let s = if key.sheen_enabled { 'S' } else { '-' };
    let a = if key.anisotropy_enabled { 'A' } else { '-' };
    let i = if key.iridescence_enabled { 'I' } else { '-' };
    let p = if key.specular_enabled { 'P' } else { '-' };
    let u = if key.subsurface_enabled { 'U' } else { '-' };
    let t = if key.transmission_enabled { 'T' } else { '-' };
    format!("{m}{b}{n}{r}{o}{e}:{cc}{s}{a}{i}{p}{u}{t}")
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
    if key.has_metallic_roughness_map {
        defines.push_str("#define HAS_METALLIC_ROUGHNESS_MAP\n");
    }
    if key.has_occlusion_map {
        defines.push_str("#define HAS_OCCLUSION_MAP\n");
    }
    if key.has_emissive_map {
        defines.push_str("#define HAS_EMISSIVE_MAP\n");
    }
    if key.clearcoat_enabled {
        defines.push_str("#define CLEARCOAT\n");
    }
    if key.sheen_enabled {
        defines.push_str("#define SHEEN\n");
    }
    if key.anisotropy_enabled {
        defines.push_str("#define ANISOTROPY\n");
    }
    if key.iridescence_enabled {
        defines.push_str("#define IRIDESCENCE\n");
    }
    if key.specular_enabled {
        defines.push_str("#define SPECULAR_EXT\n");
    }
    if key.subsurface_enabled {
        defines.push_str("#define SUBSURFACE\n");
    }
    if key.transmission_enabled {
        defines.push_str("#define TRANSMISSION\n");
    }
    defines
}

/// The fragment shader body (everything after the `"#version 300 es"` + defines
/// block). Implements Cook-Torrance GGX/Smith/Fresnel-Schlick over one
/// directional + one ambient light and writes linear HDR radiance to `fragColor`,
/// plus the extension lobes behind their `#ifdef`s.
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

/// The full vertex source for a define key (define block + body), ready to hand to
/// the GL compiler.
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
uniform float u_occlusionStrength;
uniform float u_alphaCutoff;
uniform vec3 u_cameraPosition;

uniform vec4 u_directional;
uniform vec4 u_directionalRadiance;
uniform vec3 u_ambientRadiance;
uniform float u_directionalCount;
uniform float u_ambientCount;

uniform sampler2D u_shadowMap;       // directional shadow depth map
uniform mat4 u_shadowMatrix;         // world -> shadow light-clip
uniform float u_shadowEnabled;       // 0 or 1 — gates shadow sampling

// Directional shadow factor (1.0 = lit, 0.0 = shadowed) with 3x3 PCF; fragments outside the shadow
// frustum read as lit. Multiplied into the directional term below.
float sampleDirectionalShadow(vec3 worldPos) {
  if (u_shadowEnabled < 0.5) return 1.0;
  vec4 clip = u_shadowMatrix * vec4(worldPos, 1.0);
  vec3 ndc = clip.xyz / clip.w;
  vec3 uvz = ndc * 0.5 + 0.5;
  if (uvz.x < 0.0 || uvz.x > 1.0 || uvz.y < 0.0 || uvz.y > 1.0 || uvz.z > 1.0) return 1.0;
  float current = uvz.z - 0.0025;
  vec2 texel = 1.0 / vec2(textureSize(u_shadowMap, 0));
  float sum = 0.0;
  for (int x = -1; x <= 1; ++x) {
    for (int y = -1; y <= 1; ++y) {
      float closest = texture(u_shadowMap, uvz.xy + vec2(float(x), float(y)) * texel).r;
      sum += current <= closest ? 1.0 : 0.0;
    }
  }
  return sum / 9.0;
}

uniform samplerCube u_iblIrradiance;  // diffuse irradiance cubemap
uniform samplerCube u_iblPrefiltered; // roughness-mipped prefiltered specular cubemap
uniform sampler2D u_iblBrdf;          // split-sum BRDF integration LUT (RG)
uniform float u_iblEnabled;           // 0 or 1 — gates image-based ambient
uniform float u_iblIntensity;         // environment contribution scale
uniform float u_iblMaxMip;            // highest prefiltered mip index (roughness 1.0)

// Roughness-aware Fresnel for the IBL specular term (Sébastien Lagarde): rougher surfaces reflect less
// at grazing angles than the smooth Schlick approximation.
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Image-based ambient via the split-sum approximation: diffuse irradiance over the albedo plus
// prefiltered specular weighted by the BRDF LUT. Replaces the flat ambient term when an environment
// is baked (bakeEnvironmentIbl). All three cubemap/LUT samples are already linear (baked from
// sRGB-decoded sources), so no decode here.
vec3 sampleIblAmbient(vec3 N, vec3 V, float rough, vec3 F0, vec3 diffuseColor, float occ) {
  float nv = max(dot(N, V), 1e-4);
  vec3 F = fresnelSchlickRoughness(nv, F0, rough);
  vec3 diffuse = texture(u_iblIrradiance, N).rgb * diffuseColor;
  vec3 R = reflect(-V, N);
  vec3 prefiltered = textureLod(u_iblPrefiltered, R, rough * u_iblMaxMip).rgb;
  vec2 brdf = texture(u_iblBrdf, vec2(nv, rough)).rg;
  vec3 specular = prefiltered * (F * brdf.x + brdf.y);
  return ((vec3(1.0) - F) * diffuse + specular) * occ * u_iblIntensity;
}

#ifdef HAS_BASE_COLOR_MAP
uniform sampler2D u_baseColorMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif
#ifdef HAS_METALLIC_ROUGHNESS_MAP
uniform sampler2D u_metallicRoughnessMap;
#endif
#ifdef HAS_OCCLUSION_MAP
uniform sampler2D u_occlusionMap;
#endif
#ifdef HAS_EMISSIVE_MAP
uniform sampler2D u_emissiveMap;
#endif

#ifdef CLEARCOAT
uniform float u_clearcoat;
uniform float u_clearcoatRoughness;
#endif
#ifdef SHEEN
uniform vec3 u_sheenColor;
uniform float u_sheenRoughness;
#endif
#ifdef ANISOTROPY
uniform float u_anisotropyStrength;
uniform float u_anisotropyRotation;
#endif
#ifdef IRIDESCENCE
uniform float u_iridescence;
uniform float u_iridescenceIor;
uniform float u_iridescenceThickness;
#endif
#ifdef SPECULAR_EXT
uniform float u_specular;
uniform vec3 u_specularColor;
#endif
#ifdef SUBSURFACE
uniform float u_subsurface;
uniform vec3 u_subsurfaceColor;
uniform float u_thickness;
#endif
#ifdef TRANSMISSION
uniform float u_transmission;
uniform vec3 u_attenuationColor;
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

#ifdef ANISOTROPY
// Anisotropic GGX distribution (Burley): an elliptical lobe along the tangent (at) vs bitangent
// (ab) roughness axes. tDotH/bDotH are the half-vector projections onto the rotated tangent frame.
float distributionGgxAnisotropic(float nDotH, float tDotH, float bDotH, float at, float ab) {
  float d = tDotH * tDotH / (at * at) + bDotH * bDotH / (ab * ab) + nDotH * nDotH;
  return 1.0 / max(PI * at * ab * d * d, 1e-7);
}
#endif

#ifdef SHEEN
// Charlie ("inverted GGX") sheen distribution from Estevez & Kulla — a soft retroreflective lobe
// for cloth. Approximated visibility keeps the lobe energy-plausible without a lookup table.
float distributionCharlie(float nDotH, float roughness) {
  float r = clamp(roughness, 0.07, 1.0);
  float invR = 1.0 / r;
  float cos2h = nDotH * nDotH;
  float sin2h = max(1.0 - cos2h, 1e-4);
  return (2.0 + invR) * pow(sin2h, invR * 0.5) / (2.0 * PI);
}

float visibilitySheen(float nDotV, float nDotL) {
  return 1.0 / max(4.0 * (nDotL + nDotV - nDotL * nDotV), 1e-4);
}
#endif

#ifdef IRIDESCENCE
// Thin-film interference: shift F0 toward a view-/thickness-dependent hue. A compact sinusoidal
// approximation of the optical-path-difference phase per RGB band (sample-viewer style), enough to
// produce a plausible soap-bubble rainbow without the full Airy summation.
vec3 iridescentFresnel(float cosTheta, vec3 f0, float thicknessNm, float filmIor) {
  float opd = 2.0 * filmIor * thicknessNm * cosTheta;
  vec3 bands = vec3(580.0, 540.0, 460.0); // approximate R/G/B wavelengths (nm)
  vec3 phase = 2.0 * PI * opd / bands;
  vec3 shift = 0.5 + 0.5 * cos(phase);
  vec3 base = fresnelSchlick(cosTheta, f0);
  return mix(base, shift, clamp(thicknessNm / 1000.0, 0.0, 1.0));
}
#endif

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

  vec3 tangent = normalize(v_tangent.xyz - geometricNormal * dot(v_tangent.xyz, geometricNormal));
  vec3 bitangent = cross(geometricNormal, tangent) * v_tangent.w;

  vec3 normal = geometricNormal;
#ifdef HAS_NORMAL_MAP
  vec3 tangentNormal = texture(u_normalMap, v_uv0).xyz * 2.0 - 1.0;
  tangentNormal.xy *= u_normalScale;
  mat3 tbn = mat3(tangent, bitangent, geometricNormal);
  normal = normalize(tbn * tangentNormal);
#endif

  vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
  float nDotV = max(dot(normal, viewDir), 1e-4);

  float roughness = clamp(u_roughness, 0.04, 1.0);
  float metallic = clamp(u_metallic, 0.0, 1.0);
#ifdef HAS_METALLIC_ROUGHNESS_MAP
  // glTF packing: roughness in G, metallic in B (R is occlusion if combined, ignored here).
  vec4 mr = texture(u_metallicRoughnessMap, v_uv0);
  roughness = clamp(roughness * mr.g, 0.04, 1.0);
  metallic = clamp(metallic * mr.b, 0.0, 1.0);
#endif

  float occlusion = 1.0;
#ifdef HAS_OCCLUSION_MAP
  // Occlusion in R; strength lerps between full ambient (1.0) and the sampled value.
  float ao = texture(u_occlusionMap, v_uv0).r;
  occlusion = mix(1.0, ao, clamp(u_occlusionStrength, 0.0, 1.0));
#endif

  vec3 albedo = baseColor.rgb;
  vec3 f0 = mix(vec3(0.04), albedo, metallic);

#ifdef SPECULAR_EXT
  // KHR_materials_specular: scale and tint the dielectric F0 (metals keep their albedo F0).
  vec3 dielectricF0 = min(0.04 * u_specularColor, vec3(1.0)) * u_specular;
  f0 = mix(dielectricF0, albedo, metallic);
#endif

#ifdef IRIDESCENCE
  f0 = mix(f0, iridescentFresnel(nDotV, f0, u_iridescenceThickness, u_iridescenceIor), u_iridescence);
#endif

  vec3 diffuseColor = albedo * (1.0 - metallic);

#ifdef ANISOTROPY
  // Rotate the tangent frame by u_anisotropyRotation, then split roughness into along-/across-
  // tangent axes (Burley). Higher strength stretches the highlight along the tangent direction.
  float cosR = cos(u_anisotropyRotation);
  float sinR = sin(u_anisotropyRotation);
  vec3 anisoT = normalize(cosR * tangent + sinR * bitangent);
  vec3 anisoB = normalize(cross(normal, anisoT));
  float aniso = clamp(u_anisotropyStrength, 0.0, 1.0);
  float at = max(roughness * roughness * (1.0 + aniso), 1e-3);
  float ab = max(roughness * roughness * (1.0 - aniso), 1e-3);
#endif

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    vec3 halfVec = normalize(viewDir + lightDir);
    float nDotL = max(dot(normal, lightDir), 0.0);
    float nDotH = max(dot(normal, halfVec), 0.0);
    float vDotH = max(dot(viewDir, halfVec), 0.0);

#ifdef ANISOTROPY
    float tDotH = dot(anisoT, halfVec);
    float bDotH = dot(anisoB, halfVec);
    float d = distributionGgxAnisotropic(nDotH, tDotH, bDotH, at, ab);
#else
    float d = distributionGgx(nDotH, roughness);
#endif
    float vis = visibilitySmith(nDotV, nDotL, roughness);
    vec3 fresnel = fresnelSchlick(vDotH, f0);

    vec3 specular = d * vis * fresnel;
    vec3 kd = (1.0 - fresnel) * (1.0 - metallic);
    vec3 brdf = kd * diffuseColor / PI + specular;
    vec3 direct = brdf * u_directionalRadiance.rgb * nDotL;

#ifdef SUBSURFACE
    // Wrapped-diffuse subsurface approximation (non-interop): a soft back-/side-lit wrap term
    // tinted by the subsurface color, scaled by thickness (thinner = more translucency).
    float wrap = clamp((dot(normal, lightDir) + 0.5) / 2.25, 0.0, 1.0);
    float translucency = u_subsurface / (1.0 + u_thickness);
    direct += translucency * wrap * u_subsurfaceColor * diffuseColor * u_directionalRadiance.rgb;
#endif

#ifdef SHEEN
    // Charlie sheen lobe added on top of the base specular for cloth/fabric retroreflection.
    float sheenD = distributionCharlie(nDotH, u_sheenRoughness);
    float sheenV = visibilitySheen(nDotV, nDotL);
    direct += u_sheenColor * sheenD * sheenV * u_directionalRadiance.rgb * nDotL;
#endif

#ifdef CLEARCOAT
    // A second, always-dielectric GGX lobe (F0 = 0.04) over the base layer, with its own
    // roughness. Energy from the clearcoat reflection attenuates the layers beneath it.
    float ccRough = clamp(u_clearcoatRoughness, 0.04, 1.0);
    float ccD = distributionGgx(nDotH, ccRough);
    float ccVis = visibilitySmith(nDotV, nDotL, ccRough);
    vec3 ccF = fresnelSchlick(vDotH, vec3(0.04)) * u_clearcoat;
    vec3 ccSpec = ccD * ccVis * ccF * u_directionalRadiance.rgb * nDotL;
    direct = direct * (1.0 - ccF) + ccSpec;
#endif

    radiance += direct * sampleDirectionalShadow(v_worldPosition);
  }

  // Ambient term: image-based lighting (diffuse irradiance + prefiltered specular) when an environment
  // is baked, else the flat ambient irradiance over the diffuse albedo. Both are attenuated by AO.
  if (u_iblEnabled > 0.5) {
    radiance += sampleIblAmbient(normal, viewDir, roughness, f0, diffuseColor, occlusion);
  } else if (u_ambientCount > 0.5) {
    radiance += diffuseColor * u_ambientRadiance * occlusion;
  }

  vec3 emissive = u_emissive;
#ifdef HAS_EMISSIVE_MAP
  emissive *= srgbToLinear(texture(u_emissiveMap, v_uv0).rgb);
#endif
  radiance += emissive * u_emissiveStrength;

  float alpha = baseColor.a;
#ifdef TRANSMISSION
  // Phase-5 approximation: a true refractive path needs the opaque-scene-color capture pass to
  // sample what lies behind the surface. Until then, model transmission as added translucency —
  // attenuate coverage by the transmission factor and tint the surface by the attenuation color.
  radiance *= mix(vec3(1.0), u_attenuationColor, u_transmission);
  alpha *= (1.0 - u_transmission);
#endif

  fragColor = vec4(radiance, alpha);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    const NONE: GlPbrDefineKey = GlPbrDefineKey {
        alpha_mask_enabled: false,
        anisotropy_enabled: false,
        clearcoat_enabled: false,
        has_base_color_map: false,
        has_emissive_map: false,
        has_metallic_roughness_map: false,
        has_normal_map: false,
        has_occlusion_map: false,
        iridescence_enabled: false,
        sheen_enabled: false,
        specular_enabled: false,
        subsurface_enabled: false,
        transmission_enabled: false,
    };
    const ALL: GlPbrDefineKey = GlPbrDefineKey {
        alpha_mask_enabled: true,
        anisotropy_enabled: true,
        clearcoat_enabled: true,
        has_base_color_map: true,
        has_emissive_map: true,
        has_metallic_roughness_map: true,
        has_normal_map: true,
        has_occlusion_map: true,
        iridescence_enabled: true,
        sheen_enabled: true,
        specular_enabled: true,
        subsurface_enabled: true,
        transmission_enabled: true,
    };

    // build_gl_pbr_define_key

    #[test]
    fn build_gl_pbr_define_key_produces_a_stable_distinct_string_per_flag_set() {
        assert_eq!(build_gl_pbr_define_key(&NONE), "------:-------");
        assert_eq!(build_gl_pbr_define_key(&ALL), "mbnroe:CSAIPUT");
        assert_eq!(
            build_gl_pbr_define_key(&GlPbrDefineKey {
                has_base_color_map: true,
                ..NONE
            }),
            "-b----:-------"
        );
        assert_eq!(
            build_gl_pbr_define_key(&GlPbrDefineKey {
                specular_enabled: true,
                ..NONE
            }),
            "------:----P--"
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
        assert!(all.contains("#define HAS_METALLIC_ROUGHNESS_MAP"));
        assert!(all.contains("#define HAS_OCCLUSION_MAP"));
        assert!(all.contains("#define HAS_EMISSIVE_MAP"));
        assert!(all.contains("#define CLEARCOAT"));
        assert!(all.contains("#define SHEEN"));
        assert!(all.contains("#define ANISOTROPY"));
        assert!(all.contains("#define IRIDESCENCE"));
        assert!(all.contains("#define SPECULAR_EXT"));
        assert!(all.contains("#define SUBSURFACE"));
        assert!(all.contains("#define TRANSMISSION"));

        let none = build_gl_pbr_define_source(&NONE);
        assert!(!none.contains("#define ALPHA_MASK"));
        assert!(!none.contains("#define CLEARCOAT"));
        assert!(!none.contains("#define SPECULAR_EXT"));
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
    fn get_gl_pbr_fragment_source_guards_each_extension_lobe_behind_its_define() {
        let src = get_gl_pbr_fragment_source();
        assert!(src.contains("#ifdef CLEARCOAT"));
        assert!(src.contains("#ifdef SHEEN"));
        assert!(src.contains("#ifdef ANISOTROPY"));
        assert!(src.contains("#ifdef IRIDESCENCE"));
        assert!(src.contains("#ifdef SPECULAR_EXT"));
        assert!(src.contains("#ifdef SUBSURFACE"));
        assert!(src.contains("#ifdef TRANSMISSION"));
        assert!(src.contains("distributionGgxAnisotropic"));
        assert!(src.contains("distributionCharlie"));
        assert!(src.contains("iridescentFresnel"));
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
