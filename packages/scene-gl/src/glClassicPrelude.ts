import type { GlRenderState } from '@flighthq/types';
import { MAX_FORWARD_LIGHTS } from '@flighthq/types';

import type { GlLitProgram } from './glLitProgram';
import { GL_MESH_LIGHT_BLOCK_GLSL, resolveGlLitLocations } from './glLitProgram';
import {
  GL_MAX_SKIN_JOINTS,
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
  compileGlProgram,
  ensureGlSceneProgram,
} from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';

// The shared Gl classic prelude: the GLSL 300 es vertex + fragment uber-shader for the three classic
// lit mesh-material families — Lambert (diffuse only), Phong (reflection-vector specular), and
// BlinnPhong (half-vector specular). All three share ONE source string; the lighting model is a
// compile-time define (LIGHTING_PHONG / LIGHTING_BLINNPHONG; Lambert sets neither and compiles out
// the specular branch). One directional + one ambient light are read from the standard packed light
// block (GL_MESH_LIGHT_BLOCK_GLSL), gated by the count uniforms, and the fragment stage outputs
// LINEAR HDR radiance (no tonemap / gamma here), matching the rgba16f scene target. The linear->sRGB
// encode happens at present via drawGlLinearToSrgbPass (presentGlScene, the no-effects path) — never in
// a material shader.
//
// The specular models share the Lambert diffuse term and differ only in the specular geometry:
// Phong raises max(dot(reflect(-L, N), V), 0) to the shininess exponent; BlinnPhong raises
// max(dot(N, normalize(L + V)), 0). Both need the world-space view vector, so the camera position
// (u_cameraPosition, declared in the light block) must be uploaded for Phong/BlinnPhong. Lambert
// has no view-dependent term and ignores it.
//
// The maps-present / alpha-mask variants are #ifdef branches of this one shader, never separate
// files. u_diffuse / u_specular arrive already decoded to linear on the CPU (unpackColorToLinear);
// only sampled map texels are sRgb-decoded in GLSL.

// One classic shading model. Lambert is diffuse-only; Phong and BlinnPhong add a specular lobe that
// differs only in the reflection geometry (reflection vector vs. half vector). The model is encoded
// into the program-cache key and selects the fragment shader's specular branch via a #define.
export type GlClassicLightingModel = 'blinnphong' | 'lambert' | 'phong';

// The feature flags that select a classic uber-shader variant. `lightingModel` chooses the shading
// model (and whether a specular branch exists at all); `hasDiffuseMap` / `hasSpecularMap` /
// `hasNormalMap` enable the textured paths; `alphaMaskEnabled` enables the alpha-cutoff discard for
// 'mask' materials. Lambert never sets `hasSpecularMap` or `hasNormalMap` (it has no such fields).
export interface GlClassicDefineKey {
  alphaMaskEnabled: boolean;
  hasDiffuseMap: boolean;
  hasNormalMap: boolean;
  // Whether this variant deforms the vertex by a bone palette (HAS_SKIN). Set by ensureGlClassicProgram
  // from the render-state skinned-run flag, not by the material renderer — skinning keys off geometry.
  hasSkin?: boolean;
  hasSpecularMap: boolean;
  lightingModel: GlClassicLightingModel;
}

// A compiled classic uber-shader variant plus its resolved uniform locations. One exists per distinct
// GlClassicDefineKey, cached on the GlRenderState under the `classic:` program-cache namespace.
// Extends GlLitProgram (model/normal/view-projection + the standard light/camera uniforms) with the
// classic material uniforms. Lambert leaves locSpecular / locShininess / locSpecularMap / locNormalMap
// / locNormalScale null (those uniforms are compiled out of its variant), so the renderers guard each
// upload on the location being non-null.
export interface GlClassicProgram extends GlLitProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locDiffuse: WebGLUniformLocation | null;
  locDiffuseMap: WebGLUniformLocation | null;
  locNormalMap: WebGLUniformLocation | null;
  locNormalScale: WebGLUniformLocation | null;
  locShininess: WebGLUniformLocation | null;
  locSpecular: WebGLUniformLocation | null;
  locSpecularMap: WebGLUniformLocation | null;
}

// A short, stable, order-independent string identity for a classic define key, used as the program-
// cache key. The lighting model is encoded first (l/p/b) so the three models never collide, followed
// by the feature flags. Two keys with the same model + flags produce the same string and so share a
// compiled program.
export function buildGlClassicDefineKey(key: Readonly<GlClassicDefineKey>): string {
  const model = key.lightingModel === 'phong' ? 'p' : key.lightingModel === 'blinnphong' ? 'b' : 'l';
  return `${model}${key.alphaMaskEnabled ? 'm' : '-'}${key.hasDiffuseMap ? 'd' : '-'}${
    key.hasSpecularMap ? 's' : '-'
  }${key.hasNormalMap ? 'n' : '-'}${key.hasSkin ? 'k' : '-'}`;
}

// Compiles the classic uber-shader for a define key, links it, and resolves its uniform locations.
// Pure GL work — no caching — used by ensureGlClassicProgram. Throws on a compile/link failure, which
// is a programmer error (a malformed prelude), not an expected runtime condition.
export function compileGlClassicProgram(
  gl: WebGL2RenderingContext,
  key: Readonly<GlClassicDefineKey>,
): GlClassicProgram {
  const vertexSource = getGlClassicVertexSourceForKey(key);
  const fragmentSource = getGlClassicFragmentSourceForKey(key);
  const program = compileGlProgram(gl, vertexSource, fragmentSource);
  return {
    ...resolveGlLitLocations(gl, program),
    program,
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locJointMatrices: gl.getUniformLocation(program, 'u_jointMatrices'),
    locDiffuse: gl.getUniformLocation(program, 'u_diffuse'),
    locDiffuseMap: gl.getUniformLocation(program, 'u_diffuseMap'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMap: gl.getUniformLocation(program, 'u_normalMap'),
    locNormalMatrix: gl.getUniformLocation(program, 'u_normalMatrix'),
    locNormalScale: gl.getUniformLocation(program, 'u_normalScale'),
    locShininess: gl.getUniformLocation(program, 'u_shininess'),
    locSpecular: gl.getUniformLocation(program, 'u_specular'),
    locSpecularMap: gl.getUniformLocation(program, 'u_specularMap'),
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
  };
}

// Resolves the classic program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `classic:` family namespace, so each model + feature variant
// is compiled at most once per state and reused every frame.
export function ensureGlClassicProgram(state: GlRenderState, key: Readonly<GlClassicDefineKey>): GlClassicProgram {
  // Fold the render-state skinned-run flag into the variant so a skinned draw of an otherwise-identical
  // material compiles + caches its own HAS_SKIN program, without the material renderer knowing.
  const fullKey: GlClassicDefineKey = { ...key, hasSkin: getGlSceneRuntime(state).activeSkinnedRun };
  return ensureGlSceneProgram(state, `classic:${buildGlClassicDefineKey(fullKey)}`, (gl) =>
    compileGlClassicProgram(gl, fullKey),
  );
}

// The fragment shader body (everything after the "#version 300 es" + defines block). Implements the
// classic Lambert diffuse term plus an optional Phong / BlinnPhong specular lobe over one directional
// + one ambient light, and writes linear HDR radiance to fragColor.
export function getGlClassicFragmentSource(): string {
  return CLASSIC_FRAGMENT_BODY;
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlClassicFragmentSourceForKey(key: Readonly<GlClassicDefineKey>): string {
  return buildGlClassicDefineSource(key) + CLASSIC_FRAGMENT_BODY;
}

// The vertex shader body (everything after the "#version 300 es" + defines block). Transforms the
// canonical mesh vertex (position/normal/tangent/uv0) by the model and view-projection matrices and
// passes world-space position, normal, tangent, and uv to the fragment stage — the same vertex shape
// as the PBR family.
export function getGlClassicVertexSource(): string {
  return CLASSIC_VERTEX_BODY;
}

// The full vertex source for a define key (define block + optional skin declarations + body), ready to
// hand to the GL compiler. The skin GLSL is vertex-only (its `in` attributes are illegal in a fragment
// shader), so it is spliced here rather than into the shared define block.
export function getGlClassicVertexSourceForKey(key: Readonly<GlClassicDefineKey>): string {
  const skin = key.hasSkin ? GL_SKIN_VERTEX_DECLARATIONS_GLSL : '';
  return buildGlClassicDefineSource(key) + skin + CLASSIC_VERTEX_BODY;
}

// Builds the leading "#version 300 es\n#define ..." block for a classic define key, to be prepended
// to the vertex and fragment prelude bodies before compile. Pure string assembly; the same key always
// yields the same source, which is what makes the program cache by define key sound.
function buildGlClassicDefineSource(key: Readonly<GlClassicDefineKey>): string {
  let defines = `#version 300 es\n#define MAX_FORWARD_LIGHTS ${MAX_FORWARD_LIGHTS}\n`;
  if (key.lightingModel === 'phong') defines += '#define LIGHTING_PHONG\n';
  if (key.lightingModel === 'blinnphong') defines += '#define LIGHTING_BLINNPHONG\n';
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasDiffuseMap) defines += '#define HAS_DIFFUSE_MAP\n';
  if (key.hasSpecularMap) defines += '#define HAS_SPECULAR_MAP\n';
  if (key.hasNormalMap) defines += '#define HAS_NORMAL_MAP\n';
  if (key.hasSkin) defines += `#define HAS_SKIN\n#define MAX_JOINTS ${GL_MAX_SKIN_JOINTS}\n`;
  return defines;
}

const CLASSIC_VERTEX_BODY = `
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
  v_uv0 = a_uv0;
  gl_Position = u_viewProjection * worldPosition;
}
`;

// LIGHTING_PHONG / LIGHTING_BLINNPHONG select the specular geometry; neither define = Lambert (no
// specular branch). u_specular / u_shininess / u_normalMap / u_normalScale exist only when a specular
// model is compiled in, so they are guarded by the same #ifdef as their use.
const CLASSIC_FRAGMENT_BODY = `
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

uniform vec4 u_diffuse;
uniform float u_alphaCutoff;
${GL_MESH_LIGHT_BLOCK_GLSL}
#if defined(LIGHTING_PHONG) || defined(LIGHTING_BLINNPHONG)
uniform vec4 u_specular;
uniform float u_shininess;
uniform float u_normalScale;
#endif

#ifdef HAS_DIFFUSE_MAP
uniform sampler2D u_diffuseMap;
#endif
#ifdef HAS_SPECULAR_MAP
uniform sampler2D u_specularMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif

uniform float u_objectAlpha;

out vec4 fragColor;

// sRgb albedo texels are gamma-encoded; decode to linear before lighting.
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

// The classic shading for ONE light: Lambert diffuse plus the optional Phong/BlinnPhong specular
// lobe. Every light type (directional, point, spot) routes through this one BRDF so they never fork
// the shading model — the caller supplies the surface->light direction and the light's (attenuated,
// cone-scaled) radiance. Specular reads the view vector and material specular/shininess from globals.
vec3 shadeClassicLight(vec3 normal, vec3 lightDir, vec3 lightColor, vec3 diffuseRgb) {
  float nDotL = max(dot(normal, lightDir), 0.0);
  vec3 result = diffuseRgb * nDotL * lightColor;
#if defined(LIGHTING_PHONG) || defined(LIGHTING_BLINNPHONG)
  if (nDotL > 0.0) {
    vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
    vec3 specularColor = u_specular.rgb;
  #ifdef HAS_SPECULAR_MAP
    specularColor *= srgbToLinear(texture(u_specularMap, v_uv0).rgb);
  #endif
  #ifdef LIGHTING_PHONG
    // Phong: reflection-vector specular.
    vec3 reflectDir = reflect(-lightDir, normal);
    float specAngle = max(dot(reflectDir, viewDir), 0.0);
  #else
    // BlinnPhong: half-vector specular.
    vec3 halfVec = normalize(lightDir + viewDir);
    float specAngle = max(dot(normal, halfVec), 0.0);
  #endif
    float specular = pow(specAngle, max(u_shininess, 1.0));
    result += specular * specularColor * lightColor;
  }
#endif
  return result;
}

void main() {
  vec4 diffuse = u_diffuse;
#ifdef HAS_DIFFUSE_MAP
  vec4 sampledDiffuse = texture(u_diffuseMap, v_uv0);
  diffuse.rgb *= srgbToLinear(sampledDiffuse.rgb);
  diffuse.a *= sampledDiffuse.a;
#endif

#ifdef ALPHA_MASK
  if (diffuse.a < u_alphaCutoff) discard;
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

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    radiance += shadeClassicLight(normal, lightDir, u_directionalRadiance.rgb, diffuse.rgb);
  }

  // Point lights: surface->light direction with a smooth inverse-square range falloff.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_pointCount) break;
    vec3 toLight = u_pointLights[i * 2 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_pointLights[i * 2 + 1].w) / max(dist2, 1e-4);
    radiance += shadeClassicLight(normal, lightDir, u_pointLights[i * 2 + 1].rgb * atten, diffuse.rgb);
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
    radiance += shadeClassicLight(normal, lightDir, u_spotLights[i * 4 + 1].rgb * atten * cone, diffuse.rgb);
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

  fragColor = vec4(radiance, diffuse.a);
  fragColor.a *= u_objectAlpha;
}
`;
