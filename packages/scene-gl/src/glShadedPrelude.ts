import { createModifierRegistry, getModifierDefineKey, orderModifierStack, resolveModifier } from '@flighthq/shading';
import type { ModifierRegistry } from '@flighthq/shading';
import type { GlRenderState, Modifier } from '@flighthq/types';
import { MAX_FORWARD_LIGHTS, ModifierSlot } from '@flighthq/types';

import type { GlLitProgram } from './glLitProgram';
import { GL_MESH_LIGHT_BLOCK_GLSL, resolveGlLitLocations } from './glLitProgram';
import { compileGlProgram, ensureGlSceneProgram } from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';
import type { GlModifierSnippet } from './glShadedModifierSnippet';

// The base-material feature flags that select a ShadedMaterial uber-shader variant, independent of
// the modifier stack. Mirrors the classic BlinnPhong flags: which optional maps are present and
// whether alpha-mask cutoff is active. The full program identity is this base key PLUS the modifier
// stack's define-key (see buildGlShadedCacheKey) — the base shades the diffuse + half-vector specular
// surface, the modifiers inject at the slot hooks.
export interface GlShadedDefineKey {
  alphaMaskEnabled: boolean;
  hasDiffuseMap: boolean;
  hasNormalMap: boolean;
  hasSpecularMap: boolean;
}

// A compiled ShadedMaterial program plus its resolved uniform locations. Extends GlLitProgram (the
// shared light-block/camera/shadow uniforms + the vertex model/normal/view-projection) with the base
// material uniforms and the per-frame `u_time`. Per-modifier uniforms are NOT resolved here — each
// snippet's `bind` looks its own suffixed uniforms up on `program`, so the program shape stays fixed
// while the modifier set varies. One exists per distinct (base key + modifier define-key), cached
// under the `shaded:` program-cache namespace.
export interface GlShadedProgram extends GlLitProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locDiffuse: WebGLUniformLocation | null;
  locDiffuseMap: WebGLUniformLocation | null;
  locNormalMap: WebGLUniformLocation | null;
  locNormalScale: WebGLUniformLocation | null;
  locShininess: WebGLUniformLocation | null;
  locSpecular: WebGLUniformLocation | null;
  locSpecularMap: WebGLUniformLocation | null;
  locTime: WebGLUniformLocation | null;
}

// The stable program-cache key for a ShadedMaterial variant: the base feature flags joined with the
// modifier stack's define-key. Two materials sharing both the same base flags AND the same modifier
// feature-set produce the same key and share one compiled program (and batch together); a different
// map set OR a different modifier feature-set breaks the batch. `modifierDefineKey` comes from
// @flighthq/shading's getModifierDefineKey, so cross-slot authoring order never changes it.
export function buildGlShadedCacheKey(key: Readonly<GlShadedDefineKey>, modifierDefineKey: string): string {
  const base = `${key.alphaMaskEnabled ? 'm' : '-'}${key.hasDiffuseMap ? 'd' : '-'}${key.hasSpecularMap ? 's' : '-'}${
    key.hasNormalMap ? 'n' : '-'
  }`;
  return `shaded:${base}|${modifierDefineKey}`;
}

// Compiles the ShadedMaterial uber-shader for a base key and an ORDERED modifier stack: assembles the
// base lit source (reusing GL_MESH_LIGHT_BLOCK_GLSL for lighting — no second light loop) with each
// modifier's GLSL injected at its slot hook, links it, and resolves the base + time uniform
// locations. Pure GL work — no caching — used by ensureGlShadedProgram. Throws on a compile/link
// failure (a programmer error: a malformed base or modifier snippet), not an expected runtime case.
export function compileGlShadedProgram(
  gl: WebGL2RenderingContext,
  key: Readonly<GlShadedDefineKey>,
  orderedModifiers: readonly Modifier[],
  registry: Readonly<ModifierRegistry>,
): GlShadedProgram {
  const defineSource = buildGlShadedDefineSource(key);
  const vertexSource = defineSource + SHADED_VERTEX_BODY;
  const fragmentSource = defineSource + assembleGlShadedFragmentBody(orderedModifiers, registry);
  const program = compileGlProgram(gl, vertexSource, fragmentSource);
  return {
    ...resolveGlLitLocations(gl, program),
    program,
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locDiffuse: gl.getUniformLocation(program, 'u_diffuse'),
    locDiffuseMap: gl.getUniformLocation(program, 'u_diffuseMap'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMap: gl.getUniformLocation(program, 'u_normalMap'),
    locNormalMatrix: gl.getUniformLocation(program, 'u_normalMatrix'),
    locNormalScale: gl.getUniformLocation(program, 'u_normalScale'),
    locShininess: gl.getUniformLocation(program, 'u_shininess'),
    locSpecular: gl.getUniformLocation(program, 'u_specular'),
    locSpecularMap: gl.getUniformLocation(program, 'u_specularMap'),
    locTime: gl.getUniformLocation(program, 'u_time'),
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
  };
}

// Resolves the ShadedMaterial program for a base key and modifier stack, compiling and caching it on
// first use under the `shaded:` family namespace. Orders the stack and computes its define-key from
// this state's modifier-snippet registry (so the cache key captures every compile-time modifier
// variant), then keys the shared scene program cache by base-key + modifier-define-key — each variant
// compiles at most once per state and reused every frame.
export function ensureGlShadedProgram(
  state: GlRenderState,
  key: Readonly<GlShadedDefineKey>,
  modifiers: readonly Modifier[],
): GlShadedProgram {
  // A null registry means no modifier snippet was ever registered (the lazy-allocation default); the
  // shared empty registry then yields the coarse bare-kind define-key and no modifier GLSL — the same
  // result an allocated-but-empty registry gives — without allocating on this per-bind path.
  const registry = getGlSceneRuntime(state).modifierSnippetRegistry ?? EMPTY_MODIFIER_REGISTRY;
  const ordered = orderModifierStack(modifiers);
  const cacheKey = buildGlShadedCacheKey(key, getModifierDefineKey(modifiers, registry));
  return ensureGlSceneProgram(state, cacheKey, (gl) => compileGlShadedProgram(gl, key, ordered, registry));
}

// Assembles the ShadedMaterial fragment body for an ordered modifier stack: each modifier's
// declarations are collected at the top, and each contribution is injected at the hook for its slot
// (Normal perturbs the normal before lighting, Diffuse/Specular adjust the surface terms, Emissive
// adds self-illumination, Effect post-processes the shaded radiance). A modifier whose kind has no
// registered GL snippet contributes nothing. An empty stack leaves every hook empty, yielding the
// lean plain-ShadedMaterial variant that pays nothing for modifiers it does not carry.
function assembleGlShadedFragmentBody(
  orderedModifiers: readonly Modifier[],
  registry: Readonly<ModifierRegistry>,
): string {
  let declarations = '';
  let normal = '';
  let diffuse = '';
  let specular = '';
  let emissive = '';
  let effect = '';
  for (let index = 0; index < orderedModifiers.length; index++) {
    const modifier = orderedModifiers[index];
    const snippet = resolveModifier(registry, modifier.kind) as GlModifierSnippet | null;
    if (snippet === null) continue;
    if (snippet.declarations !== undefined) declarations += `${snippet.declarations(modifier, index)}\n`;
    const contribution = `${snippet.contribution(modifier, index)}\n`;
    if (snippet.slot === ModifierSlot.Normal) normal += contribution;
    else if (snippet.slot === ModifierSlot.Diffuse) diffuse += contribution;
    else if (snippet.slot === ModifierSlot.Specular) specular += contribution;
    else if (snippet.slot === ModifierSlot.Emissive) emissive += contribution;
    else if (snippet.slot === ModifierSlot.Effect) effect += contribution;
  }
  return SHADED_FRAGMENT_TEMPLATE.replace('//@DECLARATIONS', declarations)
    .replace('//@NORMAL', normal)
    .replace('//@DIFFUSE', diffuse)
    .replace('//@SPECULAR', specular)
    .replace('//@EMISSIVE', emissive)
    .replace('//@EFFECT', effect);
}

// Builds the leading "#version 300 es\n#define ..." block shared by the vertex and fragment stages
// for a base key. Modifier variants are NOT #defines — they are injected as GLSL by
// assembleGlShadedFragmentBody — so only the base map/alpha flags appear here.
function buildGlShadedDefineSource(key: Readonly<GlShadedDefineKey>): string {
  let defines = `#version 300 es\n#define MAX_FORWARD_LIGHTS ${MAX_FORWARD_LIGHTS}\n`;
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasDiffuseMap) defines += '#define HAS_DIFFUSE_MAP\n';
  if (key.hasSpecularMap) defines += '#define HAS_SPECULAR_MAP\n';
  if (key.hasNormalMap) defines += '#define HAS_NORMAL_MAP\n';
  return defines;
}

const SHADED_VERTEX_BODY = `
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

// The ShadedMaterial fragment: a classic diffuse + half-vector-specular base over the shared light
// block, with five modifier slot hooks. The base is a self-contained blinn-phong assembly (the third
// such assembly over GL_MESH_LIGHT_BLOCK_GLSL, alongside classic + PBR); the //@HOOK markers are
// substituted with injected modifier GLSL at compile time. The variables each hook may read/write
// are documented at the marker — this is the injection contract a GL modifier snippet targets.
const SHADED_FRAGMENT_TEMPLATE = `
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

uniform vec4 u_diffuse;
uniform vec4 u_specular;
uniform float u_shininess;
uniform float u_normalScale;
uniform float u_alphaCutoff;
uniform float u_time;
${GL_MESH_LIGHT_BLOCK_GLSL}

#ifdef HAS_DIFFUSE_MAP
uniform sampler2D u_diffuseMap;
#endif
#ifdef HAS_SPECULAR_MAP
uniform sampler2D u_specularMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif

out vec4 fragColor;

// sRgb albedo texels are gamma-encoded; decode to linear before lighting.
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

// Diffuse + half-vector (BlinnPhong) specular for ONE light. Every light type routes through this so
// they never fork the shading model — the caller supplies the surface->light direction and the
// (attenuated) radiance.
vec3 shadeShadedLight(vec3 normal, vec3 lightDir, vec3 lightColor, vec3 diffuseRgb, vec3 specularColor, float shininess) {
  float nDotL = max(dot(normal, lightDir), 0.0);
  vec3 result = diffuseRgb * nDotL * lightColor;
  if (nDotL > 0.0) {
    vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
    vec3 halfVec = normalize(lightDir + viewDir);
    float specAngle = max(dot(normal, halfVec), 0.0);
    result += pow(specAngle, max(shininess, 1.0)) * specularColor * lightColor;
  }
  return result;
}

//@DECLARATIONS

void main() {
  vec4 diffuse = u_diffuse;
#ifdef HAS_DIFFUSE_MAP
  vec4 sampledDiffuse = texture(u_diffuseMap, v_uv0);
  diffuse.rgb *= srgbToLinear(sampledDiffuse.rgb);
  diffuse.a *= sampledDiffuse.a;
#endif

  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;
  vec3 tangent = normalize(v_tangent.xyz);
  vec3 bitangent = cross(geometricNormal, tangent) * v_tangent.w;
  mat3 tbn = mat3(tangent, bitangent, geometricNormal);

  vec3 normal = geometricNormal;
#ifdef HAS_NORMAL_MAP
  vec3 baseTangentNormal = texture(u_normalMap, v_uv0).xyz * 2.0 - 1.0;
  baseTangentNormal.xy *= u_normalScale;
  normal = normalize(tbn * baseTangentNormal);
#endif

  // Normal slot: read/write \`normal\` (the world-space shading normal). \`tbn\` maps tangent- to
  // world-space; \`v_uv0\` and \`u_time\` drive scrolling perturbations.
  //@NORMAL

  vec3 specularColor = u_specular.rgb;
#ifdef HAS_SPECULAR_MAP
  specularColor *= srgbToLinear(texture(u_specularMap, v_uv0).rgb);
#endif
  float shininess = u_shininess;

  // Diffuse slot: read/write \`diffuse\` (vec4 linear albedo + alpha).
  //@DIFFUSE
  // Specular slot: read/write \`specularColor\` (linear) and \`shininess\`.
  //@SPECULAR

#ifdef ALPHA_MASK
  if (diffuse.a < u_alphaCutoff) discard;
#endif

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface->light vector; modulated by the shared shadow term.
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    float shadow = sampleDirectionalShadow(v_worldPosition);
    radiance += shadeShadedLight(normal, lightDir, u_directionalRadiance.rgb, diffuse.rgb, specularColor, shininess) * shadow;
  }

  // Point lights: surface->light direction with a smooth inverse-square range falloff.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_pointCount) break;
    vec3 toLight = u_pointLights[i * 2 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_pointLights[i * 2 + 1].w) / max(dist2, 1e-4);
    radiance += shadeShadedLight(normal, lightDir, u_pointLights[i * 2 + 1].rgb * atten, diffuse.rgb, specularColor, shininess);
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
    radiance += shadeShadedLight(normal, lightDir, u_spotLights[i * 4 + 1].rgb * atten * cone, diffuse.rgb, specularColor, shininess);
  }

  // Ambient term: flat irradiance over the diffuse albedo.
  if (u_ambientCount > 0.5) {
    radiance += diffuse.rgb * u_ambientRadiance;
  }

  // Hemisphere fill: sky/ground gradient blended by the normal's vertical component.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_hemisphereCount) break;
    float f = 0.5 + 0.5 * dot(normal, u_hemisphereLights[i * 3 + 2].xyz);
    radiance += mix(u_hemisphereLights[i * 3 + 1].rgb, u_hemisphereLights[i * 3 + 0].rgb, f) * diffuse.rgb;
  }

  // Emissive slot: add self-illumination into \`emissive\` (linear radiance). \`normal\`, the light
  // uniforms, and \`v_uv0\` are available for facing gates and masks.
  vec3 emissive = vec3(0.0);
  //@EMISSIVE
  radiance += emissive;

  // Effect slot: post-process the shaded \`radiance\` (view-dependent rim, tint, etc). \`viewDir\` is
  // the world-space surface->camera direction; \`normal\` and \`v_uv0\` are available.
  vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
  //@EFFECT

  fragColor = vec4(radiance, diffuse.a);
}
`;

// A shared frozen empty registry used as the no-snippets fallback when a state has never had a
// modifier snippet registered, so ensureGlShadedProgram allocates nothing per bind.
const EMPTY_MODIFIER_REGISTRY: Readonly<ModifierRegistry> = createModifierRegistry();
