//! The shared Wgpu PBR prelude: the WGSL vertex + fragment uber-shader for the
//! StandardPbr forward-lit path AND every PBR-extension variant — the WGSL mirror
//! of scene-gl's `gl_pbr_prelude`.
//!
//! One module source is specialized per material at compile time by prepending a
//! const-flag block (see [`WgpuPbrDefineKey`] / [`build_wgpu_pbr_define_source`]):
//! WGSL has no preprocessor, so each feature flag is emitted as
//! `const FLAG : bool = …;` and the shader branches on it (the dead branch is
//! folded away by the pipeline compiler). The maps-present / double-sided /
//! alpha-mask variants AND the extension lobes (clearcoat, sheen, anisotropy,
//! iridescence, specular, subsurface, transmission) are all const-flag branches of
//! one module, never separate files. An extension renderer sets exactly one
//! extension flag on top of the standard map flags drawn from `material.standard`,
//! so the base StandardPbr path is byte-for-byte unchanged when no extension flag
//! is set.
//!
//! The lighting model is Cook-Torrance: GGX normal distribution, Smith
//! height-correlated visibility, and a Fresnel-Schlick approximation, evaluated
//! over the interpolated world-space normal/tangent/uv for one directional + one
//! ambient light read from the Frame uniform. The fragment stage outputs LINEAR
//! HDR radiance (no tonemap / gamma here — the effect pipeline's resolve/tonemap
//! pass owns that), matching the rgba16float scene target.
//!
//! Bind groups (must match `standard_pbr_wgpu_mesh_material_renderer`):
//!   group(0) Frame    : viewProjection, cameraPosition, directional + ambient.
//!   group(1) Draw     : world + normalMatrix — uniform (dynamic offset per draw).
//!   group(2) Material : the 48-float MaterialBlock (base + extension factors)
//!                       uniform + sampler + 5 maps. Extension factors ride in the
//!                       one MaterialBlock; the lobe that reads them runs only when
//!                       its const flag is set.

/// The feature flags that select an uber-shader variant. Each toggles a
/// `const … : bool` in the prelude and is hashed into the pipeline-cache key
/// ([`build_wgpu_pbr_define_key`]), so distinct flag sets compile and cache as
/// distinct pipelines. The `has_*_map` flags enable the textured paths of the
/// standard block; `alpha_mask_enabled` enables the alpha-cutoff discard for
/// `mask` materials; `double_sided` flips the normal toward the viewer on back
/// faces (paired with the pipeline's cull-none state). The extension flags
/// (`clearcoat_enabled` … `transmission_enabled`) each enable one extension lobe;
/// an extension renderer sets exactly one. Map flags inside an extension's own
/// textures are not part of the key today — extension maps are not sampled on
/// wgpu yet and the lobe reads a uniform fallback.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuPbrDefineKey {
    pub alpha_mask_enabled: bool,
    pub anisotropy_enabled: bool,
    pub clearcoat_enabled: bool,
    pub double_sided: bool,
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
/// the pipeline-cache map key (combined with the color-attachment format). Two
/// keys with the same flags produce the same string and so share a compiled
/// pipeline. Standard map/alpha/double-sided flags first, then one slot per
/// extension lobe past the `:` (mirroring scene-gl's `mbnroe:CSAIPUT` layout, with
/// the wgpu `d` double-sided slot added).
pub fn build_wgpu_pbr_define_key(key: &WgpuPbrDefineKey) -> String {
    let m = if key.alpha_mask_enabled { 'm' } else { '-' };
    let d = if key.double_sided { 'd' } else { '-' };
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
    format!("{m}{d}{b}{n}{r}{o}{e}:{cc}{s}{a}{i}{p}{u}{t}")
}

/// Builds the leading `const FLAG : bool = …;` block for a define key, prepended
/// to the module body before compile. Pure string assembly; the same key always
/// yields the same source, which is what makes the pipeline cache by define key
/// sound.
pub fn build_wgpu_pbr_define_source(key: &WgpuPbrDefineKey) -> String {
    format!(
        "const ALPHA_MASK : bool = {};\n\
         const DOUBLE_SIDED : bool = {};\n\
         const HAS_BASE_COLOR_MAP : bool = {};\n\
         const HAS_NORMAL_MAP : bool = {};\n\
         const HAS_METALLIC_ROUGHNESS_MAP : bool = {};\n\
         const HAS_OCCLUSION_MAP : bool = {};\n\
         const HAS_EMISSIVE_MAP : bool = {};\n\
         const CLEARCOAT : bool = {};\n\
         const SHEEN : bool = {};\n\
         const ANISOTROPY : bool = {};\n\
         const IRIDESCENCE : bool = {};\n\
         const SPECULAR_EXT : bool = {};\n\
         const SUBSURFACE : bool = {};\n\
         const TRANSMISSION : bool = {};\n",
        bool_literal(key.alpha_mask_enabled),
        bool_literal(key.double_sided),
        bool_literal(key.has_base_color_map),
        bool_literal(key.has_normal_map),
        bool_literal(key.has_metallic_roughness_map),
        bool_literal(key.has_occlusion_map),
        bool_literal(key.has_emissive_map),
        bool_literal(key.clearcoat_enabled),
        bool_literal(key.sheen_enabled),
        bool_literal(key.anisotropy_enabled),
        bool_literal(key.iridescence_enabled),
        bool_literal(key.specular_enabled),
        bool_literal(key.subsurface_enabled),
        bool_literal(key.transmission_enabled),
    )
}

/// The static WGSL module body (everything after the const-flag block):
/// bind-group structs, the Cook-Torrance BRDF + the extension-lobe helpers, and
/// the `vs_main`/`fs_main` entry points. Toggled by the const flags emitted ahead
/// of it; the compiler folds the dead branch away.
pub fn get_wgpu_pbr_module_body() -> &'static str {
    PBR_WGSL_BODY
}

/// The full WGSL module source for a define key (flag block + body), ready to
/// hand to `device.create_shader_module`. Convenience over
/// [`build_wgpu_pbr_define_source`] + [`get_wgpu_pbr_module_body`].
pub fn get_wgpu_pbr_module_source_for_key(key: &WgpuPbrDefineKey) -> String {
    build_wgpu_pbr_define_source(key) + PBR_WGSL_BODY
}

fn bool_literal(value: bool) -> &'static str {
    if value { "true" } else { "false" }
}

const PBR_WGSL_BODY: &str = r#"
const PI : f32 = 3.14159265359;

struct Frame {
  viewProjection : mat4x4f,
  cameraPosition : vec4f,
  lightDirection : vec4f,       // xyz = directional light travel direction; w = directionalCount
  directionalRadiance : vec4f,  // rgb = linear premultiplied radiance
  ambientRadiance : vec4f,      // rgb = linear premultiplied radiance; w = ambientCount
};

struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
};

// The 48-float MaterialBlock: the base StandardPbr block (vec4 0..3) plus one vec4 slot per extension
// lobe (matching the CPU packers in standard_pbr_wgpu_mesh_material_renderer + the extension renderers).
//   base0 : baseColor.rgba (linear)
//   base1 : emissive.rgb * strength; w unused
//   base2 : metallic, roughness, normalScale, occlusionStrength
//   base3 : alphaCutoff, _, _, _
//   clearcoat   : clearcoat, clearcoatRoughness, _, _
//   sheen       : sheenColor.rgb, sheenRoughness
//   anisotropy  : anisotropyStrength, anisotropyRotation, _, _
//   iridescence : iridescence, iridescenceIor, iridescenceThickness (nm), _
//   specular    : specular, specularColor.rgb
//   subsurface  : subsurface, subsurfaceColor.rgb
//   thickness   : thickness, _, _, _
//   transmission: transmission, attenuationColor.rgb
struct MaterialBlock {
  baseColor : vec4f,
  emissive : vec4f,
  factors : vec4f,
  flags : vec4f,
  clearcoat : vec4f,
  sheen : vec4f,
  anisotropy : vec4f,
  iridescence : vec4f,
  specular : vec4f,
  subsurface : vec4f,
  thickness : vec4f,
  transmission : vec4f,
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> draw : Draw;
@group(2) @binding(0) var<uniform> material : MaterialBlock;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var baseColorTexture : texture_2d<f32>;
@group(2) @binding(3) var metallicRoughnessTexture : texture_2d<f32>;
@group(2) @binding(4) var normalTexture : texture_2d<f32>;
@group(2) @binding(5) var occlusionTexture : texture_2d<f32>;
@group(2) @binding(6) var emissiveTexture : texture_2d<f32>;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) worldPosition : vec3f,
  @location(1) worldNormal : vec3f,
  @location(2) worldTangent : vec4f,
  @location(3) uv : vec2f,
};

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
  @location(2) tangent : vec4f,
  @location(3) uv : vec2f,
) -> VertexOutput {
  var out : VertexOutput;
  let world = draw.world * vec4f(position, 1.0);
  out.worldPosition = world.xyz;
  out.clipPosition = frame.viewProjection * world;
  out.worldNormal = draw.normalMatrix * normal;
  out.worldTangent = vec4f(draw.normalMatrix * tangent.xyz, tangent.w);
  out.uv = uv;
  return out;
}

// sRgb albedo texels are gamma-encoded; decode to linear before lighting.
fn srgbToLinear(c : vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(lo, hi, c > vec3f(0.04045));
}

fn distributionGgx(nDotH : f32, roughness : f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

fn visibilitySmith(nDotV : f32, nDotL : f32, roughness : f32) -> f32 {
  let a = roughness * roughness;
  let k = a * 0.5;
  let gv = nDotV / (nDotV * (1.0 - k) + k);
  let gl = nDotL / (nDotL * (1.0 - k) + k);
  return gv * gl;
}

fn fresnelSchlick(cosTheta : f32, f0 : vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Anisotropic GGX distribution (Burley): an elliptical lobe along the tangent (at) vs bitangent (ab)
// roughness axes. tDotH/bDotH are the half-vector projections onto the rotated tangent frame.
fn distributionGgxAnisotropic(nDotH : f32, tDotH : f32, bDotH : f32, at : f32, ab : f32) -> f32 {
  let d = tDotH * tDotH / (at * at) + bDotH * bDotH / (ab * ab) + nDotH * nDotH;
  return 1.0 / max(PI * at * ab * d * d, 1e-7);
}

// Charlie ("inverted GGX") sheen distribution from Estevez & Kulla — a soft retroreflective lobe for
// cloth. Approximated visibility keeps the lobe energy-plausible without a lookup table.
fn distributionCharlie(nDotH : f32, roughness : f32) -> f32 {
  let r = clamp(roughness, 0.07, 1.0);
  let invR = 1.0 / r;
  let cos2h = nDotH * nDotH;
  let sin2h = max(1.0 - cos2h, 1e-4);
  return (2.0 + invR) * pow(sin2h, invR * 0.5) / (2.0 * PI);
}

fn visibilitySheen(nDotV : f32, nDotL : f32) -> f32 {
  return 1.0 / max(4.0 * (nDotL + nDotV - nDotL * nDotV), 1e-4);
}

// Thin-film interference: shift F0 toward a view-/thickness-dependent hue. A compact sinusoidal
// approximation of the optical-path-difference phase per RGB band (sample-viewer style), enough to
// produce a plausible soap-bubble rainbow without the full Airy summation.
fn iridescentFresnel(cosTheta : f32, f0 : vec3f, thicknessNm : f32, filmIor : f32) -> vec3f {
  let opd = 2.0 * filmIor * thicknessNm * cosTheta;
  let bands = vec3f(580.0, 540.0, 460.0); // approximate R/G/B wavelengths (nm)
  let phase = 2.0 * PI * opd / bands;
  let shift = vec3f(0.5) + vec3f(0.5) * cos(phase);
  let base = fresnelSchlick(cosTheta, f0);
  return mix(base, shift, clamp(thicknessNm / 1000.0, 0.0, 1.0));
}

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var baseColor = material.baseColor;
  if (HAS_BASE_COLOR_MAP) {
    let sampled = textureSample(baseColorTexture, materialSampler, in.uv);
    baseColor = vec4f(baseColor.rgb * srgbToLinear(sampled.rgb), baseColor.a * sampled.a);
  }

  if (ALPHA_MASK && baseColor.a < material.flags.x) {
    discard;
  }

  var geometricNormal = normalize(in.worldNormal);
  // Double-sided materials flip the normal for back faces so both sides shade correctly.
  if (DOUBLE_SIDED && !isFront) {
    geometricNormal = -geometricNormal;
  }

  let tangent = normalize(in.worldTangent.xyz - geometricNormal * dot(in.worldTangent.xyz, geometricNormal));
  let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;

  var normal = geometricNormal;
  if (HAS_NORMAL_MAP) {
    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - vec3f(1.0);
    tangentNormal = vec3f(tangentNormal.xy * material.factors.z, tangentNormal.z);
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }

  let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);
  let nDotV = max(dot(normal, viewDir), 1e-4);

  var roughness = clamp(material.factors.y, 0.04, 1.0);
  var metallic = clamp(material.factors.x, 0.0, 1.0);
  if (HAS_METALLIC_ROUGHNESS_MAP) {
    // glTF packing: roughness in G, metallic in B (R is occlusion if combined, ignored here).
    let mr = textureSample(metallicRoughnessTexture, materialSampler, in.uv);
    roughness = clamp(roughness * mr.g, 0.04, 1.0);
    metallic = clamp(metallic * mr.b, 0.0, 1.0);
  }

  // Occlusion defaults to full ambient; the map (R channel) attenuates it, lerped by occlusionStrength
  // (factors.w). Without a map the ambient term is unattenuated, matching the GL path.
  var occlusion = 1.0;
  if (HAS_OCCLUSION_MAP) {
    let ao = textureSample(occlusionTexture, materialSampler, in.uv).r;
    occlusion = mix(1.0, ao, clamp(material.factors.w, 0.0, 1.0));
  }

  let albedo = baseColor.rgb;
  var f0 = mix(vec3f(0.04), albedo, metallic);

  if (SPECULAR_EXT) {
    // KHR_materials_specular: scale and tint the dielectric F0 (metals keep their albedo F0).
    let dielectricF0 = min(0.04 * material.specular.yzw, vec3f(1.0)) * material.specular.x;
    f0 = mix(dielectricF0, albedo, metallic);
  }

  if (IRIDESCENCE) {
    let irid = iridescentFresnel(nDotV, f0, material.iridescence.z, material.iridescence.y);
    f0 = mix(f0, irid, material.iridescence.x);
  }

  let diffuseColor = albedo * (1.0 - metallic);

  // Anisotropy: rotate the tangent frame, then split roughness into along-/across-tangent axes
  // (Burley). Higher strength stretches the highlight along the tangent direction.
  let anisoStrength = clamp(material.anisotropy.x, 0.0, 1.0);
  let cosR = cos(material.anisotropy.y);
  let sinR = sin(material.anisotropy.y);
  let anisoT = normalize(cosR * tangent + sinR * bitangent);
  let anisoB = normalize(cross(normal, anisoT));
  let at = max(roughness * roughness * (1.0 + anisoStrength), 1e-3);
  let ab = max(roughness * roughness * (1.0 - anisoStrength), 1e-3);

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let halfVec = normalize(viewDir + lightDir);
    let nDotL = max(dot(normal, lightDir), 0.0);
    let nDotH = max(dot(normal, halfVec), 0.0);
    let vDotH = max(dot(viewDir, halfVec), 0.0);

    var d = distributionGgx(nDotH, roughness);
    if (ANISOTROPY) {
      let tDotH = dot(anisoT, halfVec);
      let bDotH = dot(anisoB, halfVec);
      d = distributionGgxAnisotropic(nDotH, tDotH, bDotH, at, ab);
    }
    let vis = visibilitySmith(nDotV, nDotL, roughness);
    let fresnel = fresnelSchlick(vDotH, f0);

    let specular = d * vis * fresnel;
    let kd = (vec3f(1.0) - fresnel) * (1.0 - metallic);
    let brdf = kd * diffuseColor / PI + specular;
    var direct = brdf * frame.directionalRadiance.rgb * nDotL;

    if (SUBSURFACE) {
      // Wrapped-diffuse subsurface approximation (non-interop): a soft back-/side-lit wrap term tinted
      // by the subsurface color, scaled by thickness (thinner = more translucency).
      let wrap = clamp((dot(normal, lightDir) + 0.5) / 2.25, 0.0, 1.0);
      let translucency = material.subsurface.x / (1.0 + material.thickness.x);
      direct = direct + translucency * wrap * material.subsurface.yzw * diffuseColor * frame.directionalRadiance.rgb;
    }

    if (SHEEN) {
      // Charlie sheen lobe added on top of the base specular for cloth/fabric retroreflection.
      let sheenD = distributionCharlie(nDotH, material.sheen.w);
      let sheenV = visibilitySheen(nDotV, nDotL);
      direct = direct + material.sheen.rgb * sheenD * sheenV * frame.directionalRadiance.rgb * nDotL;
    }

    if (CLEARCOAT) {
      // A second, always-dielectric GGX lobe (F0 = 0.04) over the base layer, with its own roughness.
      // Energy from the clearcoat reflection attenuates the layers beneath it.
      let ccRough = clamp(material.clearcoat.y, 0.04, 1.0);
      let ccD = distributionGgx(nDotH, ccRough);
      let ccVis = visibilitySmith(nDotV, nDotL, ccRough);
      let ccF = fresnelSchlick(vDotH, vec3f(0.04)) * material.clearcoat.x;
      let ccSpec = ccD * ccVis * ccF * frame.directionalRadiance.rgb * nDotL;
      direct = direct * (vec3f(1.0) - ccF) + ccSpec;
    }

    radiance = radiance + direct;
  }

  // Ambient term: flat irradiance over the diffuse albedo (no IBL specular yet), attenuated by AO.
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + diffuseColor * frame.ambientRadiance.rgb * occlusion;
  }

  var emissive = material.emissive.rgb;
  if (HAS_EMISSIVE_MAP) {
    emissive = emissive * srgbToLinear(textureSample(emissiveTexture, materialSampler, in.uv).rgb);
  }
  radiance = radiance + emissive;

  var alpha = baseColor.a;
  if (TRANSMISSION) {
    // Phase-5 approximation: a true refractive path needs the opaque-scene-color capture pass to
    // sample what lies behind the surface. Until then, model transmission as added translucency —
    // attenuate coverage by the transmission factor and tint the surface by the attenuation color.
    radiance = radiance * mix(vec3f(1.0), material.transmission.yzw, material.transmission.x);
    alpha = alpha * (1.0 - material.transmission.x);
  }

  return vec4f(radiance, alpha);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    const NONE: WgpuPbrDefineKey = WgpuPbrDefineKey {
        alpha_mask_enabled: false,
        anisotropy_enabled: false,
        clearcoat_enabled: false,
        double_sided: false,
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
    const ALL: WgpuPbrDefineKey = WgpuPbrDefineKey {
        alpha_mask_enabled: true,
        anisotropy_enabled: true,
        clearcoat_enabled: true,
        double_sided: true,
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

    mod build_wgpu_pbr_define_key {
        use super::*;

        #[test]
        fn produces_a_stable_distinct_string_per_flag_set() {
            assert_eq!(build_wgpu_pbr_define_key(&NONE), "-------:-------");
            assert_eq!(build_wgpu_pbr_define_key(&ALL), "mdbnroe:CSAIPUT");
            assert_eq!(
                build_wgpu_pbr_define_key(&WgpuPbrDefineKey {
                    alpha_mask_enabled: true,
                    ..NONE
                }),
                "m------:-------"
            );
            assert_eq!(
                build_wgpu_pbr_define_key(&WgpuPbrDefineKey {
                    double_sided: true,
                    ..NONE
                }),
                "-d-----:-------"
            );
            assert_eq!(
                build_wgpu_pbr_define_key(&WgpuPbrDefineKey {
                    has_base_color_map: true,
                    ..NONE
                }),
                "--b----:-------"
            );
            assert_eq!(
                build_wgpu_pbr_define_key(&WgpuPbrDefineKey {
                    specular_enabled: true,
                    ..NONE
                }),
                "-------:----P--"
            );
            assert_eq!(
                build_wgpu_pbr_define_key(&WgpuPbrDefineKey {
                    clearcoat_enabled: true,
                    ..NONE
                }),
                "-------:C------"
            );
        }

        #[test]
        fn is_identical_for_identical_flags_cache_soundness() {
            let a = build_wgpu_pbr_define_key(&WgpuPbrDefineKey {
                has_base_color_map: true,
                ..NONE
            });
            let b = build_wgpu_pbr_define_key(&WgpuPbrDefineKey {
                has_base_color_map: true,
                ..NONE
            });
            assert_eq!(a, b);
        }
    }

    mod build_wgpu_pbr_define_source {
        use super::*;

        #[test]
        fn emits_a_const_bool_flag_block_reflecting_the_key() {
            let source = build_wgpu_pbr_define_source(&WgpuPbrDefineKey {
                has_base_color_map: true,
                double_sided: true,
                ..NONE
            });
            assert!(source.contains("const HAS_BASE_COLOR_MAP : bool = true;"));
            assert!(source.contains("const DOUBLE_SIDED : bool = true;"));
            assert!(source.contains("const ALPHA_MASK : bool = false;"));
            assert!(source.contains("const HAS_NORMAL_MAP : bool = false;"));
        }

        #[test]
        fn emits_a_const_for_each_extension_lobe() {
            let all = build_wgpu_pbr_define_source(&ALL);
            assert!(all.contains("const CLEARCOAT : bool = true;"));
            assert!(all.contains("const SHEEN : bool = true;"));
            assert!(all.contains("const ANISOTROPY : bool = true;"));
            assert!(all.contains("const IRIDESCENCE : bool = true;"));
            assert!(all.contains("const SPECULAR_EXT : bool = true;"));
            assert!(all.contains("const SUBSURFACE : bool = true;"));
            assert!(all.contains("const TRANSMISSION : bool = true;"));

            let none = build_wgpu_pbr_define_source(&NONE);
            assert!(none.contains("const CLEARCOAT : bool = false;"));
            assert!(none.contains("const SPECULAR_EXT : bool = false;"));
        }
    }

    mod get_wgpu_pbr_module_body {
        use super::*;

        #[test]
        fn declares_the_entry_points_and_bind_group_structs() {
            let body = get_wgpu_pbr_module_body();
            assert!(body.contains("fn vs_main"));
            assert!(body.contains("fn fs_main"));
            assert!(body.contains("struct Frame"));
            assert!(body.contains("struct MaterialBlock"));
            assert!(body.contains("var<uniform> frame"));
        }

        #[test]
        fn guards_each_extension_lobe_behind_its_const_flag() {
            let body = get_wgpu_pbr_module_body();
            assert!(body.contains("if (CLEARCOAT)"));
            assert!(body.contains("if (SHEEN)"));
            assert!(body.contains("if (ANISOTROPY)"));
            assert!(body.contains("if (IRIDESCENCE)"));
            assert!(body.contains("if (SPECULAR_EXT)"));
            assert!(body.contains("if (SUBSURFACE)"));
            assert!(body.contains("if (TRANSMISSION)"));
            assert!(body.contains("distributionGgxAnisotropic"));
            assert!(body.contains("distributionCharlie"));
            assert!(body.contains("iridescentFresnel"));
        }

        #[test]
        fn declares_the_48_float_material_block_with_extension_slots() {
            let body = get_wgpu_pbr_module_body();
            assert!(body.contains("clearcoat : vec4f"));
            assert!(body.contains("sheen : vec4f"));
            assert!(body.contains("anisotropy : vec4f"));
            assert!(body.contains("iridescence : vec4f"));
            assert!(body.contains("specular : vec4f"));
            assert!(body.contains("subsurface : vec4f"));
            assert!(body.contains("thickness : vec4f"));
            assert!(body.contains("transmission : vec4f"));
        }
    }

    mod get_wgpu_pbr_module_source_for_key {
        use super::*;

        #[test]
        fn prepends_the_flag_block_to_the_module_body() {
            let k = WgpuPbrDefineKey {
                has_normal_map: true,
                ..NONE
            };
            let source = get_wgpu_pbr_module_source_for_key(&k);
            assert!(source.starts_with(&build_wgpu_pbr_define_source(&k)));
            assert!(source.contains("fn fs_main"));
        }
    }
}
