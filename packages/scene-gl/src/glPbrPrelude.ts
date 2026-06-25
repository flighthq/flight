// The shared Gl PBR prelude: the GLSL 300 es vertex + fragment uber-shader for the StandardPbr
// forward-lit path and every PBR-extension variant. One source string is specialized per material
// at compile time by prepending a define block (see GlPbrDefineKey / buildGlPbrDefineSource), so
// the maps-present / double-sided / alpha-mode variants AND the extension lobes (clearcoat, sheen,
// anisotropy, iridescence, specular, subsurface, transmission) are all #ifdef branches of one
// shader, never separate files. An extension renderer sets exactly one extension define on top of
// the standard map flags drawn from `material.standard`, so the base StandardPbr path is byte-for-
// byte unchanged when no extension flag is set.
//
// The lighting model is Cook-Torrance: GGX normal distribution, Smith height-correlated
// visibility, and a Fresnel-Schlick approximation, evaluated over the interpolated world-space
// normal/tangent/uv for one directional + one ambient light read from the packed light block. The
// fragment shader outputs LINEAR HDR radiance (no tonemap / gamma here — the effect pipeline's
// resolve/tonemap pass owns that), matching the rgba16f scene target.
//
// The light block UBO mirrors SceneLightBlock.data exactly (std140): a directional term
// { direction.xyz, _pad, radiance.rgb, _pad } at offset 0 then an ambient term { radiance.rgb,
// _pad } — radiance is already linear and premultiplied by intensity at pack time, so the shader
// never decodes sRgb. u_directionalCount / u_ambientCount (0 or 1) gate each term's contribution.
//
// Color spaces: sampled albedo/color textures (baseColor, emissive, sheenColor, specularColor,
// subsurfaceColor) are sRgb-encoded and decoded in GLSL via srgbToLinear. Data maps (normal,
// metallic-roughness, occlusion, clearcoat, anisotropy, iridescence-thickness, thickness,
// transmission) are linear and read raw. Packed material colors are decoded to linear on the CPU
// with unpackColorToLinear before upload, so the shader never double-decodes them.

// The feature flags that select an uber-shader variant. Each toggles an #ifdef in the prelude and
// is hashed into the program-cache key (buildGlPbrDefineKey), so distinct flag sets compile and
// cache as distinct programs. The `has*Map` flags enable the textured paths of the standard block;
// `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials. The extension flags
// (`clearcoatEnabled` … `transmissionEnabled`) each enable one extension lobe; an extension
// renderer sets exactly one. Map flags inside an extension's own textures are not part of the key
// today — extension maps are bound when present and the lobe reads a uniform fallback otherwise.
export interface GlPbrDefineKey {
  alphaMaskEnabled: boolean;
  anisotropyEnabled: boolean;
  clearcoatEnabled: boolean;
  hasBaseColorMap: boolean;
  hasEmissiveMap: boolean;
  hasMetallicRoughnessMap: boolean;
  hasNormalMap: boolean;
  hasOcclusionMap: boolean;
  iridescenceEnabled: boolean;
  sheenEnabled: boolean;
  specularEnabled: boolean;
  subsurfaceEnabled: boolean;
  transmissionEnabled: boolean;
}

// A short, stable, order-independent string identity for a define key, used as the program-cache
// map key. Two keys with the same flags produce the same string and so share a compiled program.
// Standard map/alpha flags first, then one slot per extension lobe.
export function buildGlPbrDefineKey(key: Readonly<GlPbrDefineKey>): string {
  return (
    `${key.alphaMaskEnabled ? 'm' : '-'}` +
    `${key.hasBaseColorMap ? 'b' : '-'}` +
    `${key.hasNormalMap ? 'n' : '-'}` +
    `${key.hasMetallicRoughnessMap ? 'r' : '-'}` +
    `${key.hasOcclusionMap ? 'o' : '-'}` +
    `${key.hasEmissiveMap ? 'e' : '-'}` +
    `:${key.clearcoatEnabled ? 'C' : '-'}` +
    `${key.sheenEnabled ? 'S' : '-'}` +
    `${key.anisotropyEnabled ? 'A' : '-'}` +
    `${key.iridescenceEnabled ? 'I' : '-'}` +
    `${key.specularEnabled ? 'P' : '-'}` +
    `${key.subsurfaceEnabled ? 'U' : '-'}` +
    `${key.transmissionEnabled ? 'T' : '-'}`
  );
}

// Builds the leading "#version 300 es\n#define ..." block for a define key, to be prepended to the
// vertex and fragment prelude bodies before compile. Pure string assembly; the same key always
// yields the same source, which is what makes the program cache by define key sound.
export function buildGlPbrDefineSource(key: Readonly<GlPbrDefineKey>): string {
  let defines = '#version 300 es\n';
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasBaseColorMap) defines += '#define HAS_BASE_COLOR_MAP\n';
  if (key.hasNormalMap) defines += '#define HAS_NORMAL_MAP\n';
  if (key.hasMetallicRoughnessMap) defines += '#define HAS_METALLIC_ROUGHNESS_MAP\n';
  if (key.hasOcclusionMap) defines += '#define HAS_OCCLUSION_MAP\n';
  if (key.hasEmissiveMap) defines += '#define HAS_EMISSIVE_MAP\n';
  if (key.clearcoatEnabled) defines += '#define CLEARCOAT\n';
  if (key.sheenEnabled) defines += '#define SHEEN\n';
  if (key.anisotropyEnabled) defines += '#define ANISOTROPY\n';
  if (key.iridescenceEnabled) defines += '#define IRIDESCENCE\n';
  if (key.specularEnabled) defines += '#define SPECULAR_EXT\n';
  if (key.subsurfaceEnabled) defines += '#define SUBSURFACE\n';
  if (key.transmissionEnabled) defines += '#define TRANSMISSION\n';
  return defines;
}

// The fragment shader body (everything after the "#version 300 es" + defines block). Implements
// Cook-Torrance GGX/Smith/Fresnel-Schlick over one directional + one ambient light and writes
// linear HDR radiance to fragColor, plus the extension lobes behind their #ifdefs.
export function getGlPbrFragmentSource(): string {
  return PBR_FRAGMENT_BODY;
}

// The full fragment source for a define key (define block + body), ready to hand to the GL
// compiler. Convenience over buildGlPbrDefineSource + getGlPbrFragmentSource.
export function getGlPbrFragmentSourceForKey(key: Readonly<GlPbrDefineKey>): string {
  return buildGlPbrDefineSource(key) + PBR_FRAGMENT_BODY;
}

// The vertex shader body (everything after the "#version 300 es" + defines block). Transforms the
// canonical PBR vertex record (position/normal/tangent/uv0) by the model and view-projection
// matrices and passes world-space position, normal, tangent, and uv to the fragment stage.
export function getGlPbrVertexSource(): string {
  return PBR_VERTEX_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlPbrVertexSourceForKey(key: Readonly<GlPbrDefineKey>): string {
  return buildGlPbrDefineSource(key) + PBR_VERTEX_BODY;
}

const PBR_VERTEX_BODY = `
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
`;

const PBR_FRAGMENT_BODY = `
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

    radiance += direct;
  }

  // Ambient term: flat irradiance over the diffuse albedo (no IBL specular yet), attenuated by AO.
  if (u_ambientCount > 0.5) {
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
  // TODO Phase 5: replace with a refracted background sample + Beer-Lambert volume absorption.
  radiance *= mix(vec3(1.0), u_attenuationColor, u_transmission);
  alpha *= (1.0 - u_transmission);
#endif

  fragColor = vec4(radiance, alpha);
}
`;
