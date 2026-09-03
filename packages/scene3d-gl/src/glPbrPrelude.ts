import type {
  GlColorAdjustmentMaterialFeature,
  GlPbrDefineKey,
  GlPbrExtensionShaderContribution,
} from '@flighthq/types/contract';
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
// The light block UBO mirrors Scene3DLightBlock.data exactly (std140): a directional term
// { direction.xyz, _pad, radiance.rgb, _pad } at offset 0 then an ambient term { radiance.rgb,
// _pad } — radiance is already linear and premultiplied by intensity at pack time, so the shader
// never decodes sRgb. u_directionalCount / u_ambientCount (0 or 1) gate each term's contribution.
//
// Color spaces: every resolved Texture chooses a linear or sRGB GPU internal format from its
// colorSpace descriptor, so sampling color maps returns linear values while data maps remain raw.
// Packed material colors are decoded to linear on the CPU with unpackColorToLinear before upload.

import { MAX_FORWARD_LIGHTS } from '@flighthq/types/contract';

import { GL_DIRECTIONAL_SHADOW_GLSL } from './glLitProgram';
import { GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS } from './glMeshFragmentTail';
import {
  GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
  GL_UV_TRANSFORM_VERTEX_GLSL,
} from './glMeshProgram';
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
    `${key.hasAlphaMap ? 'a' : '-'}` +
    `${key.hasUvTransform ? 'u' : '-'}` +
    `:${key.hasSkin ? 'k' : '-'}` +
    `${key.hasInstances ? 'i' : '-'}` +
    `${key.hasColorMatrix ? 'x' : key.hasColorAdjustment ? 'c' : ''}`
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
  if (key.hasAlphaMap) defines += '#define HAS_ALPHA_MAP\n';
  if (key.hasInstances) defines += '#define HAS_INSTANCES\n';
  if (key.hasSkin) defines += '#define HAS_SKIN\n';
  if (key.hasColorMatrix) defines += '#define HAS_COLOR_MATRIX\n';
  else if (key.hasColorAdjustment) defines += '#define HAS_COLOR_ADJUSTMENT\n';
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
export function getGlPbrFragmentSourceForKey(
  key: Readonly<GlPbrDefineKey>,
  contributions: readonly GlPbrExtensionShaderContribution[] = [],
  colorAdjustmentFeature: Readonly<GlColorAdjustmentMaterialFeature> | null = null,
): string {
  let body = composeGlPbrExtensionSource(PBR_FRAGMENT_BODY, contributions);
  if ((key.hasColorAdjustment || key.hasColorMatrix) && colorAdjustmentFeature !== null) {
    body = body.replace(
      'precision highp float;',
      `precision highp float;\n${
        key.hasColorMatrix
          ? colorAdjustmentFeature.matrixFragmentShaderChunk
          : colorAdjustmentFeature.fragmentShaderChunk
      }`,
    );
  }
  return buildGlPbrDefineSource(key) + (contributions.length > 0 ? '#define HAS_PBR_EXTENSIONS\n' : '') + body;
}

function composeGlPbrExtensionSource(body: string, contributions: readonly GlPbrExtensionShaderContribution[]): string {
  return body
    .replace(PBR_EXTENSION_DECLARATIONS, contributions.map((value) => value.fragmentDeclarations).join('\n'))
    .replace(PBR_EXTENSION_FUNCTIONS, contributions.map((value) => value.fragmentFunctions).join('\n'))
    .replace(PBR_EXTENSION_SURFACE, contributions.map((value) => value.applySurface).join('\n'))
    .replace(PBR_EXTENSION_PUNCTUAL, contributions.map((value) => value.contributePunctual).join('\n'))
    .replace(PBR_EXTENSION_IBL, contributions.map((value) => value.contributeIbl).join('\n'))
    .replace(PBR_EXTENSION_FINALIZE, contributions.map((value) => value.finalize).join('\n'));
}

// The vertex shader body (everything after the "#version 300 es" + defines block). Transforms the
// canonical PBR vertex record (position/normal/tangent/uv0) by the model and view-projection
// matrices and passes world-space position, normal, tangent, and uv to the fragment scene2d.
export function getGlPbrVertexSource(): string {
  return PBR_VERTEX_BODY;
}

// The full vertex source for a define key (define block + optional skin declarations + body), ready to
// hand to the GL compiler. The skin GLSL is vertex-only (its `in` attributes are illegal in a fragment
// shader), so it is spliced here rather than into the shared define block.
export function getGlPbrVertexSourceForKey(key: Readonly<GlPbrDefineKey>): string {
  const skin = key.hasSkin ? GL_SKIN_VERTEX_DECLARATIONS_GLSL : '';
  const instances = key.hasInstances ? GL_INSTANCE_VERTEX_DECLARATIONS_GLSL : '';
  return buildGlPbrDefineSource(key) + skin + instances + PBR_VERTEX_BODY;
}

const PBR_EXTENSION_DECLARATIONS = '/*__PBR_EXTENSION_DECLARATIONS__*/';
const PBR_EXTENSION_FINALIZE = '/*__PBR_EXTENSION_FINALIZE__*/';
const PBR_EXTENSION_FUNCTIONS = '/*__PBR_EXTENSION_FUNCTIONS__*/';
const PBR_EXTENSION_IBL = '/*__PBR_EXTENSION_IBL__*/';
const PBR_EXTENSION_PUNCTUAL = '/*__PBR_EXTENSION_PUNCTUAL__*/';
const PBR_EXTENSION_SURFACE = '/*__PBR_EXTENSION_SURFACE__*/';

const PBR_VERTEX_BODY = `
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;
layout(location = 5) in vec2 a_uv1;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
${GL_UV_TRANSFORM_VERTEX_GLSL}
out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;
out vec2 v_pbrExtensionUv0;
out vec2 v_pbrExtensionUv1;

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
  // A tangent is a TRUE SURFACE VECTOR and follows the model matrix, the same one a position
  // follows. Only the normal is a covector needing the inverse-transpose. The two agree under
  // rotation and uniform scale, which is why sharing u_normalMatrix looked correct, and diverge
  // under non-uniform scale, tilting the tangent off the surface it is supposed to lie in.
  // tangent.w is HANDEDNESS, and a model transform that mirrors (negative determinant) reverses it:
  // the bitangent is rebuilt as w * cross(N, T), so without this the whole frame is flipped on every
  // mirrored instance. Guarded rather than sign(), because sign() returns 0 for a singular matrix
  // and a zero w collapses the bitangent entirely — a worse failure than keeping the original hand.
  mat3 modelRotation = mat3(u_model);
#endif
  float tangentHandedness = a_tangent.w * (determinant(modelRotation) < 0.0 ? -1.0 : 1.0);
  v_tangent = vec4(modelRotation * localTangent, tangentHandedness);
  v_uv0 = applyUvTransform(a_uv0);
  v_pbrExtensionUv0 = a_uv0;
  v_pbrExtensionUv1 = a_uv1;
  gl_Position = u_viewProjection * worldPosition;
}
`;

const PBR_FRAGMENT_BODY = `
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;
in vec2 v_pbrExtensionUv0;
in vec2 v_pbrExtensionUv1;

uniform vec4 u_baseColor;
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

// Punctual (point/spot/hemisphere) forward-light arrays — layout mirrors Scene3DLightBlock.data exactly
// (packScene3DLightBlock), matching GL_MESH_LIGHT_BLOCK_GLSL used by the classic prelude. Fixed
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

${PBR_EXTENSION_DECLARATIONS}

${GL_DIRECTIONAL_SHADOW_GLSL}

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
#ifdef HAS_ALPHA_MAP
uniform sampler2D u_alphaMap;
#endif

${GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

const float PI = 3.14159265359;

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

${PBR_EXTENSION_FUNCTIONS}

// Image-based ambient via the split-sum approximation: diffuse irradiance over the albedo plus
// prefiltered specular weighted by the BRDF LUT. Replaces the flat ambient term when an environment
// is baked (bakeGlEnvironmentIbl). All three cubemap/LUT samples are already linear (baked from
// sRGB-decoded sources), so no decode here. This function follows the contributed helpers because
// GLSL ES requires a function to be declared before a caller uses it.
vec3 sampleIblAmbient(
  vec3 N, vec3 V, vec3 tangentDir, vec3 bitangentDir, float rough, vec3 F0, vec3 diffuseColor, float occ
) {
  float nv = max(dot(N, V), 1e-4);
  vec3 F = fresnelSchlickRoughness(nv, F0, rough);
  vec3 diffuse = texture(u_iblIrradiance, N).rgb * diffuseColor;
  vec3 R = reflect(-V, N);
  vec3 prefiltered = textureLod(u_iblPrefiltered, R, rough * u_iblMaxMip).rgb;
  vec2 brdf = texture(u_iblBrdf, vec2(nv, rough)).rg;
  vec3 specular = prefiltered * (F * brdf.x + brdf.y);
  vec3 ambient = ((vec3(1.0) - F) * diffuse + specular) * occ * u_iblIntensity;
${PBR_EXTENSION_IBL}
  return ambient;
}

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

  float d = distributionGgx(nDotH, roughness);
  float vis = visibilitySmith(nDotV, nDotL, roughness);
  vec3 fresnel = fresnelSchlick(vDotH, f0);

  vec3 specular = d * vis * fresnel;
  vec3 kd = (1.0 - fresnel) * (1.0 - metallic);
  vec3 brdf = kd * diffuseColor / PI + specular;
  vec3 direct = brdf * lightColor * nDotL;

${PBR_EXTENSION_PUNCTUAL}

  return direct;
}

void main() {
  vec4 baseColor = u_baseColor;
#ifdef HAS_BASE_COLOR_MAP
  vec4 sampled = texture(u_baseColorMap, v_uv0);
  baseColor.rgb *= sampled.rgb;
  baseColor.a *= sampled.a;
#endif

  // Dedicated coverage (opacity) map: its green channel is linear data, multiplied into alpha before
  // the alpha-mask cutoff so 'mask' cutout and 'blend' transparency both see the combined coverage.
#ifdef HAS_ALPHA_MAP
  baseColor.a *= texture(u_alphaMap, v_uv0).g;
#endif

#ifdef ALPHA_MASK
  if (baseColor.a < u_alphaCutoff) discard;
  baseColor.a = 1.0;
#endif

  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;

#if defined(HAS_NORMAL_MAP) || defined(HAS_PBR_EXTENSIONS)
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

  vec3 diffuseColor = albedo * (1.0 - metallic);

${PBR_EXTENSION_SURFACE}

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    vec3 direct = shadePbrPunctual(normal, viewDir, tangent, bitangent, lightDir,
                                   u_directionalRadiance.rgb, f0, diffuseColor, roughness, metallic);
    radiance += direct * sampleDirectionalShadow(v_worldPosition, geometricNormal);
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
    radiance += sampleIblAmbient(normal, viewDir, tangent, bitangent, roughness, f0, diffuseColor, occlusion);
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
  emissive *= texture(u_emissiveMap, v_uv0).rgb;
#endif
  radiance += emissive * u_emissiveStrength;

  float alpha = baseColor.a;
${PBR_EXTENSION_FINALIZE}

  fragColor = vec4(radiance, alpha);
#ifdef HAS_COLOR_MATRIX
  fragColor = applyFlightColorMatrix(fragColor, u_flightColorMatrix0, u_flightColorMatrix1,
    u_flightColorMatrix2, u_flightColorMatrix3, u_flightColorMatrixOffset);
#elif defined(HAS_COLOR_ADJUSTMENT)
  fragColor = applyFlightColorAdjustment(fragColor, u_flightColorScale, u_flightColorBias);
#endif
${GL_MESH_FRAGMENT_TAIL}
}
`;
