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

import { MAX_FORWARD_LIGHTS } from '@flighthq/types';

import { GL_MAX_SKIN_JOINTS, GL_SKIN_VERTEX_DECLARATIONS_GLSL, GL_UV_TRANSFORM_VERTEX_GLSL } from './glMeshProgram';

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
  // Set by ensureGlPbrProgram from the render-state skinned-run flag, not the material renderer — skinning keys off geometry.
  hasSkin?: boolean;
  // Whether the base-color map carries a non-identity uv transform (HAS_UV_TRANSFORM); it drives the
  // shared v_uv0 every standard map samples. Set only when hasBaseColorMap is also true.
  hasUvTransform: boolean;
  // Palette size baked into `#define MAX_JOINTS` when hasSkin. Set by ensureGlPbrProgram from
  // getGlSkinJointCapacity; falls back to GL_MAX_SKIN_JOINTS. Must equal drawGlScene's GPU-skinning gate.
  maxJoints?: number;
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
    `${key.hasUvTransform ? 'u' : '-'}` +
    `:${key.clearcoatEnabled ? 'C' : '-'}` +
    `${key.sheenEnabled ? 'S' : '-'}` +
    `${key.anisotropyEnabled ? 'A' : '-'}` +
    `${key.iridescenceEnabled ? 'I' : '-'}` +
    `${key.specularEnabled ? 'P' : '-'}` +
    `${key.subsurfaceEnabled ? 'U' : '-'}` +
    `${key.transmissionEnabled ? 'T' : '-'}` +
    `${key.hasSkin ? 'k' : '-'}`
  );
}

// Builds the leading "#version 300 es\n#define ..." block for a define key, to be prepended to the
// vertex and fragment prelude bodies before compile. Pure string assembly; the same key always
// yields the same source, which is what makes the program cache by define key sound.
export function buildGlPbrDefineSource(key: Readonly<GlPbrDefineKey>): string {
  let defines = `#version 300 es\n#define MAX_FORWARD_LIGHTS ${MAX_FORWARD_LIGHTS}\n`;
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasBaseColorMap) defines += '#define HAS_BASE_COLOR_MAP\n';
  if (key.hasUvTransform) defines += '#define HAS_UV_TRANSFORM\n';
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
  if (key.hasSkin) defines += `#define HAS_SKIN\n#define MAX_JOINTS ${key.maxJoints ?? GL_MAX_SKIN_JOINTS}\n`;
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

// The full vertex source for a define key (define block + optional skin declarations + body), ready to
// hand to the GL compiler. The skin GLSL is vertex-only (its `in` attributes are illegal in a fragment
// shader), so it is spliced here rather than into the shared define block.
export function getGlPbrVertexSourceForKey(key: Readonly<GlPbrDefineKey>): string {
  return buildGlPbrDefineSource(key) + (key.hasSkin ? GL_SKIN_VERTEX_DECLARATIONS_GLSL : '') + PBR_VERTEX_BODY;
}

const PBR_VERTEX_BODY = `
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
${GL_UV_TRANSFORM_VERTEX_GLSL}
out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;

void main() {
#ifdef HAS_SKIN
  mat4 skin = skinMatrix();
  vec4 localPosition = skin * vec4(a_position, 1.0);
  vec3 localNormal = mat3(skin) * a_normal;
  vec3 localTangent = mat3(skin) * a_tangent.xyz;
#else
  vec4 localPosition = vec4(a_position, 1.0);
  vec3 localNormal = a_normal;
  vec3 localTangent = a_tangent.xyz;
#endif
  vec4 worldPosition = u_model * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * localNormal;
  v_tangent = vec4(u_normalMatrix * localTangent, a_tangent.w);
  v_uv0 = applyUvTransform(a_uv0);
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

// Punctual (point/spot/hemisphere) forward-light arrays — layout mirrors SceneLightBlock.data exactly
// (packSceneLightBlock), matching GL_MESH_LIGHT_BLOCK_GLSL used by the classic prelude. Fixed
// MAX_FORWARD_LIGHTS-wide; each count bounds its loop.
//   point[i]      = u_pointLights[i*2+0]={pos.xyz,range}, [i*2+1]={radiance.rgb,invSqrRange}
//   spot[i]       = u_spotLights[i*4+0..1] as point, [i*4+2]={dir.xyz,_}, [i*4+3]={cosInner,cosOuter,_,_}
//   hemisphere[i] = u_hemisphereLights[i*3+0]={sky.rgb,_}, [i*3+1]={ground.rgb,_}, [i*3+2]={up.xyz,_}
uniform vec4 u_pointLights[MAX_FORWARD_LIGHTS * 2];
uniform vec4 u_spotLights[MAX_FORWARD_LIGHTS * 4];
uniform vec4 u_hemisphereLights[MAX_FORWARD_LIGHTS * 3];
uniform int u_pointCount;
uniform int u_spotCount;
uniform int u_hemisphereCount;

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

uniform float u_objectAlpha;

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

// Smooth inverse-square range window (glTF/UE4): 1 near the light, eased to 0 at the range. invSqrRange
// is 1/range^2 (0 = infinite range, no cutoff); dist2 is the squared surface->light distance.
float rangeWindow(float dist2, float invSqrRange) {
  float factor = dist2 * invSqrRange;
  float windowed = clamp(1.0 - factor * factor, 0.0, 1.0);
  return windowed * windowed;
}

// The full Cook-Torrance shading (plus every enabled extension lobe) for ONE light. Directional,
// point, and spot lights all route through this one BRDF so punctual lights never fork the shading
// model — the caller passes the surface->light direction L and that light's (attenuated, cone-scaled)
// radiance. The anisotropic tangent frame is rebuilt here per light from the surface tangent frame so
// the function stays self-contained; f0/diffuseColor/roughness/metallic are the finalized surface
// values from main. Returns the light's linear radiance contribution (shadowing applied by the caller).
vec3 shadePbrPunctual(vec3 N, vec3 V, vec3 tangentDir, vec3 bitangentDir, vec3 L, vec3 lightColor,
                      vec3 f0, vec3 diffuseColor, float roughness, float metallic) {
  float nDotV = max(dot(N, V), 1e-4);
  vec3 halfVec = normalize(V + L);
  float nDotL = max(dot(N, L), 0.0);
  float nDotH = max(dot(N, halfVec), 0.0);
  float vDotH = max(dot(V, halfVec), 0.0);

#ifdef ANISOTROPY
  float cosR = cos(u_anisotropyRotation);
  float sinR = sin(u_anisotropyRotation);
  vec3 anisoT = normalize(cosR * tangentDir + sinR * bitangentDir);
  vec3 anisoB = normalize(cross(N, anisoT));
  float aniso = clamp(u_anisotropyStrength, 0.0, 1.0);
  float at = max(roughness * roughness * (1.0 + aniso), 1e-3);
  float ab = max(roughness * roughness * (1.0 - aniso), 1e-3);
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
  vec3 direct = brdf * lightColor * nDotL;

#ifdef SUBSURFACE
  // Wrapped-diffuse subsurface approximation (non-interop): a soft back-/side-lit wrap term tinted by
  // the subsurface color, scaled by thickness (thinner = more translucency).
  float wrap = clamp((dot(N, L) + 0.5) / 2.25, 0.0, 1.0);
  float translucency = u_subsurface / (1.0 + u_thickness);
  direct += translucency * wrap * u_subsurfaceColor * diffuseColor * lightColor;
#endif

#ifdef SHEEN
  // Charlie sheen lobe added on top of the base specular for cloth/fabric retroreflection.
  float sheenD = distributionCharlie(nDotH, u_sheenRoughness);
  float sheenV = visibilitySheen(nDotV, nDotL);
  direct += u_sheenColor * sheenD * sheenV * lightColor * nDotL;
#endif

#ifdef CLEARCOAT
  // A second, always-dielectric GGX lobe (F0 = 0.04) over the base layer, with its own roughness.
  // Energy from the clearcoat reflection attenuates the layers beneath it.
  float ccRough = clamp(u_clearcoatRoughness, 0.04, 1.0);
  float ccD = distributionGgx(nDotH, ccRough);
  float ccVis = visibilitySmith(nDotV, nDotL, ccRough);
  vec3 ccF = fresnelSchlick(vDotH, vec3(0.04)) * u_clearcoat;
  vec3 ccSpec = ccD * ccVis * ccF * lightColor * nDotL;
  direct = direct * (1.0 - ccF) + ccSpec;
#endif

  return direct;
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

#if defined(HAS_NORMAL_MAP) || defined(ANISOTROPY)
  vec3 tangent = normalize(v_tangent.xyz - geometricNormal * dot(v_tangent.xyz, geometricNormal));
  vec3 bitangent = cross(geometricNormal, tangent) * v_tangent.w;
#else
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 bitangent = vec3(0.0, 1.0, 0.0);
#endif

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

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    vec3 direct = shadePbrPunctual(normal, viewDir, tangent, bitangent, lightDir,
                                   u_directionalRadiance.rgb, f0, diffuseColor, roughness, metallic);
    radiance += direct * sampleDirectionalShadow(v_worldPosition);
  }

  // Point lights: surface->light direction with a smooth inverse-square range falloff, same BRDF.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_pointCount) break;
    vec3 toLight = u_pointLights[i * 2 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_pointLights[i * 2 + 1].w) / max(dist2, 1e-4);
    radiance += shadePbrPunctual(normal, viewDir, tangent, bitangent, lightDir,
                                 u_pointLights[i * 2 + 1].rgb * atten, f0, diffuseColor, roughness, metallic);
  }

  // Spot lights: point attenuation times a smooth cone falloff between the inner/outer cosines.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_spotCount) break;
    vec3 toLight = u_spotLights[i * 4 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_spotLights[i * 4 + 1].w) / max(dist2, 1e-4);
    float cone = smoothstep(u_spotLights[i * 4 + 3].y, u_spotLights[i * 4 + 3].x,
                            dot(normalize(u_spotLights[i * 4 + 2].xyz), -lightDir));
    radiance += shadePbrPunctual(normal, viewDir, tangent, bitangent, lightDir,
                                 u_spotLights[i * 4 + 1].rgb * atten * cone, f0, diffuseColor, roughness, metallic);
  }

  // Ambient term: image-based lighting (diffuse irradiance + prefiltered specular) when an environment
  // is baked, else the flat ambient irradiance over the diffuse albedo. Both are attenuated by AO.
  if (u_iblEnabled > 0.5) {
    radiance += sampleIblAmbient(normal, viewDir, roughness, f0, diffuseColor, occlusion);
  } else if (u_ambientCount > 0.5) {
    radiance += diffuseColor * u_ambientRadiance * occlusion;
  }

  // Hemisphere fill: sky/ground gradient blended by the normal's vertical component, AO-attenuated.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_hemisphereCount) break;
    float f = 0.5 + 0.5 * dot(normal, u_hemisphereLights[i * 3 + 2].xyz);
    radiance += mix(u_hemisphereLights[i * 3 + 1].rgb, u_hemisphereLights[i * 3 + 0].rgb, f)
                * diffuseColor * occlusion;
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
  fragColor.a *= u_objectAlpha;
}
`;
