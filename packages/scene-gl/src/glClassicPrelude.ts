import type { GlRenderState } from '@flighthq/types';

import type { GlLitProgram } from './glLitProgram';
import { GL_MESH_LIGHT_BLOCK_GLSL, resolveGlLitLocations } from './glLitProgram';
import { compileGlProgram, ensureGlSceneProgram } from './glMeshProgram';

// The shared Gl classic prelude: the GLSL 300 es vertex + fragment uber-shader for the three classic
// lit mesh-material families — Lambert (diffuse only), Phong (reflection-vector specular), and
// BlinnPhong (half-vector specular). All three share ONE source string; the lighting model is a
// compile-time define (LIGHTING_PHONG / LIGHTING_BLINNPHONG; Lambert sets neither and compiles out
// the specular branch). One directional + one ambient light are read from the standard packed light
// block (GL_MESH_LIGHT_BLOCK_GLSL), gated by the count uniforms, and the fragment stage outputs
// LINEAR HDR radiance (no tonemap / gamma here — the effect pipeline's resolve pass owns that),
// matching the rgba16f scene target.
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
  }${key.hasNormalMap ? 'n' : '-'}`;
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
  return ensureGlSceneProgram(state, `classic:${buildGlClassicDefineKey(key)}`, (gl) =>
    compileGlClassicProgram(gl, key),
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

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlClassicVertexSourceForKey(key: Readonly<GlClassicDefineKey>): string {
  return buildGlClassicDefineSource(key) + CLASSIC_VERTEX_BODY;
}

// Builds the leading "#version 300 es\n#define ..." block for a classic define key, to be prepended
// to the vertex and fragment prelude bodies before compile. Pure string assembly; the same key always
// yields the same source, which is what makes the program cache by define key sound.
function buildGlClassicDefineSource(key: Readonly<GlClassicDefineKey>): string {
  let defines = '#version 300 es\n';
  if (key.lightingModel === 'phong') defines += '#define LIGHTING_PHONG\n';
  if (key.lightingModel === 'blinnphong') defines += '#define LIGHTING_BLINNPHONG\n';
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasDiffuseMap) defines += '#define HAS_DIFFUSE_MAP\n';
  if (key.hasSpecularMap) defines += '#define HAS_SPECULAR_MAP\n';
  if (key.hasNormalMap) defines += '#define HAS_NORMAL_MAP\n';
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
  vec4 worldPosition = u_model * vec4(a_position, 1.0);
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * a_normal;
  v_tangent = vec4(u_normalMatrix * a_tangent.xyz, a_tangent.w);
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

out vec4 fragColor;

// sRgb albedo texels are gamma-encoded; decode to linear before lighting.
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
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
    float nDotL = max(dot(normal, lightDir), 0.0);
    radiance += diffuse.rgb * nDotL * u_directionalRadiance.rgb;

#if defined(LIGHTING_PHONG) || defined(LIGHTING_BLINNPHONG)
    if (nDotL > 0.0) {
      vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
      vec3 specularColor = u_specular.rgb;
  #ifdef HAS_SPECULAR_MAP
      vec4 sampledSpecular = texture(u_specularMap, v_uv0);
      specularColor *= srgbToLinear(sampledSpecular.rgb);
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
      radiance += specular * specularColor * u_directionalRadiance.rgb;
    }
#endif
  }

  // Ambient term: flat irradiance over the diffuse albedo.
  if (u_ambientCount > 0.5) {
    radiance += diffuse.rgb * u_ambientRadiance;
  }

  fragColor = vec4(radiance, diffuse.a);
}
`;
