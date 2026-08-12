import { getGlColorAdjustmentMaterialFeature, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { getModifierDefineKey, orderModifierStack, resolveModifier } from '@flighthq/shading/contract';
import type {
  GlColorAdjustmentMaterialFeature,
  GlModifierSnippet,
  GlRenderState,
  GlShadedDefineKey,
  GlShadedProgram,
  KeyedTable,
  Modifier,
  ModifierKind,
  ModifierRegistry,
} from '@flighthq/types/contract';
import { MAX_FORWARD_LIGHTS, ModifierSlot, RegistryEntryState } from '@flighthq/types/contract';

import { GL_MESH_LIGHT_BLOCK_GLSL, resolveGlLitLocations } from './glLitProgram';
import { GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS } from './glMeshFragmentTail';
import {
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
  GL_UV_TRANSFORM_VERTEX_GLSL,
  compileGlProgram,
  ensureGlScene3DProgram,
} from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';

type GlModifierSnippetSource = Readonly<ModifierRegistry> | Readonly<KeyedTable<GlModifierSnippet>>;
// The stable program-cache key for a ShadedMaterial variant: the base feature flags joined with the
// modifier stack's define-key. Two materials sharing both the same base flags AND the same modifier
// feature-set produce the same key and share one compiled program (and batch together); a different
// map set OR a different modifier feature-set breaks the batch. `modifierDefineKey` comes from
// @flighthq/shading's getModifierDefineKey, so cross-slot authoring order never changes it.
export function buildGlShadedCacheKey(key: Readonly<GlShadedDefineKey>, modifierDefineKey: string): string {
  const base = `${key.alphaMaskEnabled ? 'm' : '-'}${key.hasDiffuseMap ? 'd' : '-'}${key.hasSpecularMap ? 's' : '-'}${
    key.hasNormalMap ? 'n' : '-'
  }${key.hasUvTransform ? 'u' : '-'}${key.hasSkin ? 'k' : '-'}${
    key.hasColorMatrix ? 'x' : key.hasColorAdjustment ? 'c' : ''
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
  registry: GlModifierSnippetSource,
  colorAdjustmentFeature: Readonly<GlColorAdjustmentMaterialFeature> | null = null,
): GlShadedProgram {
  const defineSource = buildGlShadedDefineSource(key);
  // The skin GLSL is vertex-only (its `in` attributes are illegal in a fragment shader), so it is
  // spliced into the vertex source alone, never the fragment. The Vertex-slot modifiers are likewise
  // vertex-only — they deform the geometry — so they inject into the vertex body, not the fragment.
  const vertexSource =
    defineSource +
    (key.hasSkin ? GL_SKIN_VERTEX_DECLARATIONS_GLSL : '') +
    assembleGlShadedVertexBody(orderedModifiers, registry);
  let fragmentBody = assembleGlShadedFragmentBody(orderedModifiers, registry);
  if ((key.hasColorAdjustment || key.hasColorMatrix) && colorAdjustmentFeature !== null) {
    fragmentBody = fragmentBody.replace(
      'precision highp float;',
      `precision highp float;\n${
        key.hasColorMatrix
          ? colorAdjustmentFeature.matrixFragmentShaderChunk
          : colorAdjustmentFeature.fragmentShaderChunk
      }`,
    );
  }
  const fragmentSource = defineSource + fragmentBody;
  const program = compileGlProgram(gl, vertexSource, fragmentSource);
  return {
    ...resolveGlLitLocations(gl, program),
    program,
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locDiffuse: gl.getUniformLocation(program, 'u_diffuse'),
    locDiffuseMap: gl.getUniformLocation(program, 'u_diffuseMap'),
    locJointNormalTexture: gl.getUniformLocation(program, 'u_jointNormalTexture'),
    locJointTexture: gl.getUniformLocation(program, 'u_jointTexture'),
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
  const registries = getGlRenderStateRuntime(state).registries;
  const registry = registries.modifierSnippets;
  const ordered = orderModifierStack(modifiers);
  // Fold the render-state skinned-run flag into the variant so a skinned draw of an otherwise-identical
  // material compiles + caches its own HAS_SKIN program, without the material renderer knowing.
  const fullKey: GlShadedDefineKey = {
    ...key,
    hasColorAdjustment: getGlScene3DRuntime(state).activeColorAdjustmentRun,
    hasColorMatrix: getGlScene3DRuntime(state).activeColorMatrixRun,
    hasSkin: getGlScene3DRuntime(state).activeSkinnedRun,
  };
  const cacheKey = `${buildGlShadedCacheKey(fullKey, getGlModifierDefineKey(modifiers, registry))}|registry:${
    registries.modifierSnippetRevision
  }`;
  return ensureGlScene3DProgram(state, cacheKey, (gl) =>
    compileGlShadedProgram(gl, fullKey, ordered, registry, getGlColorAdjustmentMaterialFeature(state)),
  );
}

// Assembles the ShadedMaterial fragment body for an ordered modifier stack: each FRAGMENT-slot
// modifier's declarations are collected at the top, and each contribution is injected at the hook for
// its slot (Normal perturbs the normal before lighting, Diffuse/Specular adjust the surface terms,
// Emissive adds self-illumination, Effect post-processes the shaded radiance). Vertex-slot modifiers
// are skipped here — they inject into the vertex body (assembleGlShadedVertexBody). A modifier whose
// kind has no registered GL snippet contributes nothing. An empty stack leaves every hook empty,
// yielding the lean plain-ShadedMaterial variant that pays nothing for modifiers it does not carry.
function assembleGlShadedFragmentBody(
  orderedModifiers: readonly Modifier[],
  registry: GlModifierSnippetSource,
): string {
  let declarations = '';
  let normal = '';
  let diffuse = '';
  let specular = '';
  let emissive = '';
  let effect = '';
  for (let index = 0; index < orderedModifiers.length; index++) {
    const modifier = orderedModifiers[index];
    const snippet = resolveGlModifierSnippetSource(registry, modifier.kind);
    if (snippet === null || snippet.slot === ModifierSlot.Vertex) continue;
    if (snippet.declarations !== undefined) declarations += `${snippet.declarations(modifier, index)}\n`;
    const contribution = `${snippet.contribution(modifier, index)}\n`;
    if (snippet.slot === ModifierSlot.Normal) normal += contribution;
    else if (snippet.slot === ModifierSlot.Diffuse) diffuse += contribution;
    else if (snippet.slot === ModifierSlot.Specular) specular += contribution;
    else if (snippet.slot === ModifierSlot.Emissive) emissive += contribution;
    else if (snippet.slot === ModifierSlot.Effect) effect += contribution;
  }
  return SHADED_FRAGMENT_TEMPLATE.replace('//@DECLARATIONS', dedupeGlShadedDeclarations(declarations))
    .replace('//@NORMAL', normal)
    .replace('//@DIFFUSE', diffuse)
    .replace('//@SPECULAR', specular)
    .replace('//@EMISSIVE', emissive)
    .replace('//@EFFECT', effect);
}

// Assembles the ShadedMaterial vertex body for an ordered modifier stack: only the VERTEX-slot
// modifiers contribute here (they deform the geometry). Their declarations go at the top-level
// //@VERTEX_DECLARATIONS hook and their contributions at the //@VERTEX hook — after localPosition/
// localNormal are computed (post-skin) but before the model transform, so displacement composes with
// skinning. Non-vertex slots are skipped (they inject into the fragment body). An empty vertex set
// leaves both hooks empty, yielding the plain vertex program.
function assembleGlShadedVertexBody(orderedModifiers: readonly Modifier[], registry: GlModifierSnippetSource): string {
  let declarations = '';
  let vertex = '';
  for (let index = 0; index < orderedModifiers.length; index++) {
    const modifier = orderedModifiers[index];
    const snippet = resolveGlModifierSnippetSource(registry, modifier.kind);
    if (snippet === null || snippet.slot !== ModifierSlot.Vertex) continue;
    if (snippet.declarations !== undefined) declarations += `${snippet.declarations(modifier, index)}\n`;
    vertex += `${snippet.contribution(modifier, index)}\n`;
  }
  return SHADED_VERTEX_BODY.replace('//@VERTEX_DECLARATIONS', dedupeGlShadedDeclarations(declarations)).replace(
    '//@VERTEX',
    vertex,
  );
}

// Collapses duplicate declaration lines in an assembled modifier declaration block, preserving the
// order of first appearance and dropping later exact repeats. Per-instance uniforms are unique (each
// name carries its stack-index suffix, e.g. `u_fogColor_2`), so they always survive; the SHARED
// un-suffixed lines a snippet declares — the IBL environment samplers an env-reflect modifier reads,
// or the value-noise helper a procedural dissolve declares — collapse to one when two modifiers of the
// same kind appear in one stack, avoiding a GLSL redefinition error. Blank lines are kept verbatim so
// helper-function bodies (whose braces span lines) stay intact.
function dedupeGlShadedDeclarations(declarations: string): string {
  const seen = new Set<string>();
  let result = '';
  for (const line of declarations.split('\n')) {
    const trimmed = line.trim();
    const isSharedDeclaration = trimmed.startsWith('uniform ') && !/_\d+\b/.test(trimmed);
    if (isSharedDeclaration) {
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
    }
    result += `${line}\n`;
  }
  return result;
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
  if (key.hasUvTransform) defines += '#define HAS_UV_TRANSFORM\n';
  if (key.hasSkin) defines += '#define HAS_SKIN\n';
  if (key.hasColorMatrix) defines += '#define HAS_COLOR_MATRIX\n';
  else if (key.hasColorAdjustment) defines += '#define HAS_COLOR_ADJUSTMENT\n';
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
uniform float u_time;
${GL_UV_TRANSFORM_VERTEX_GLSL}
out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;

//@VERTEX_DECLARATIONS

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
  vec2 vertexUv = a_uv0;

  // Vertex slot: read/write \`localPosition\` (the pre-model local vertex) and \`localNormal\`; the
  // procedural cases scroll by \`u_time\` and read \`vertexUv\` (the raw uv, before the uv transform).
  //@VERTEX

  vec4 worldPosition = u_model * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * localNormal;
  v_tangent = vec4(u_normalMatrix * localTangent, a_tangent.w);
  v_uv0 = applyUvTransform(a_uv0);
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

${GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

// Deterministic 2D value noise, declared in the base so any Effect-slot modifier (the procedural
// dissolve mask) can call it without redeclaring a function — a GLSL compiler drops it when no
// modifier references it, so a plain ShadedMaterial pays nothing for it.
float shadedHashNoise(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float shadedValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = shadedHashNoise(i + vec2(0.0, 0.0));
  float b = shadedHashNoise(i + vec2(1.0, 0.0));
  float c = shadedHashNoise(i + vec2(0.0, 1.0));
  float d = shadedHashNoise(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
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
  diffuse.rgb *= sampledDiffuse.rgb;
  diffuse.a *= sampledDiffuse.a;
#endif

  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;
  // Gram-Schmidt-reorthogonalize the interpolated tangent against the interpolated normal before
  // building the TBN: linear interpolation across a triangle leaves v_tangent no longer perpendicular
  // to v_normal, and skipping this step skews the tangent frame — the normal-map artifact this base
  // shader previously exhibited. Mirrors the PBR prelude's TBN construction exactly.
  vec3 tangent = normalize(v_tangent.xyz - geometricNormal * dot(v_tangent.xyz, geometricNormal));
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
  specularColor *= texture(u_specularMap, v_uv0).rgb;
#endif
  float shininess = u_shininess;

  // Diffuse slot: read/write \`diffuse\` (vec4 linear albedo + alpha).
  //@DIFFUSE
  // Specular slot: read/write \`specularColor\` (linear) and \`shininess\`.
  //@SPECULAR

#ifdef ALPHA_MASK
  if (diffuse.a < u_alphaCutoff) discard;
  diffuse.a = 1.0;
#endif

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface->light vector; modulated by the shared shadow term.
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    float shadow = sampleDirectionalShadow(v_worldPosition, geometricNormal);
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
#ifdef HAS_COLOR_MATRIX
  fragColor = applyFlightColorMatrix(fragColor, u_flightColorMatrix0, u_flightColorMatrix1,
    u_flightColorMatrix2, u_flightColorMatrix3, u_flightColorMatrixOffset);
#elif defined(HAS_COLOR_ADJUSTMENT)
  fragColor = applyFlightColorAdjustment(fragColor, u_flightColorScale, u_flightColorBias);
#endif
${GL_MESH_FRAGMENT_TAIL}
}
`;

function getGlModifierDefineKey(stack: readonly Modifier[], registry: GlModifierSnippetSource): string {
  if (!isGlModifierSnippetTable(registry)) return getModifierDefineKey(stack, registry);
  const ordered = orderModifierStack(stack);
  let key = '';
  for (const modifier of ordered) {
    const snippet = resolveGlModifierSnippetSource(registry, modifier.kind);
    const signature = snippet?.getDefineSignature?.(modifier) ?? '';
    const token = signature.length > 0 ? `${modifier.kind}:${signature}` : modifier.kind;
    key = key.length > 0 ? `${key}+${token}` : token;
  }
  return key;
}

function resolveGlModifierSnippetSource(
  registry: GlModifierSnippetSource,
  kind: ModifierKind,
): GlModifierSnippet | null {
  if (!isGlModifierSnippetTable(registry)) return resolveModifier(registry, kind) as GlModifierSnippet | null;
  const entry = registry.entries.get(kind);
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

function isGlModifierSnippetTable(
  registry: GlModifierSnippetSource,
): registry is Readonly<KeyedTable<GlModifierSnippet>> {
  return 'shape' in registry;
}
