import { bindGlTexture } from '@flighthq/render-gl';
import type { GlRenderState, Texture } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';
import { compileGlProgram, ensureGlSceneProgram } from './glMeshProgram';

// The shared Gl debug prelude: the GLSL 300 es vertex + fragment shader for the lighting-INDEPENDENT
// debug/utility pass materials (Depth, Normal). One source string is specialized per material at
// compile time by a define block (see GlDebugDefineKey): a `mode` discriminator selects the DEPTH_MODE
// vs NORMAL_MODE fragment branch, and HAS_NORMAL_MAP enables the tangent-space normal-map path. Both
// modes output LINEAR color with no lighting term, matching the rgba16f scene target.
//
// Depth mode linearizes the perspective-encoded window-space depth (gl_FragCoord.z) back into eye
// space, maps it across [u_near, u_far] to [0, 1], and writes it as grayscale `vec3(d)`. Normal mode
// transforms the geometric normal by the normal matrix (so the visualized normal is WORLD-space),
// optionally perturbs it through a tangent-space normal map (TBN built from the world normal/tangent
// like the PBR path), and encodes the unit normal as color `n * 0.5 + 0.5`.
//
// The fragment vertex stage always passes world-space position/normal/tangent and uv so the same one
// source supports both modes and the normal-map branch without a separate vertex variant.

// A compiled debug variant plus its resolved uniform locations. Extends GlMeshProgram (it carries the
// model + normal matrix + view-projection the vertex stage needs) with the debug fragment uniforms.
// `locNear`/`locFar` drive the depth linearization; `locNormalMap`/`locNormalScale` drive the optional
// normal-map perturbation. A given location is null in the mode/variant that does not declare it. One
// exists per distinct GlDebugDefineKey, cached on the GlRenderState under the `debug:` namespace.
export interface GlDebugProgram extends GlMeshProgram {
  locFar: WebGLUniformLocation | null;
  locNear: WebGLUniformLocation | null;
  locNormalMap: WebGLUniformLocation | null;
  locNormalScale: WebGLUniformLocation | null;
}

// The feature flags that select a debug variant. `mode` picks the depth vs normal fragment branch;
// `hasNormalMap` enables the sampled tangent-space normal-map perturbation (normal mode only — depth
// ignores it). Distinct keys compile and cache as distinct programs.
export interface GlDebugDefineKey {
  hasNormalMap: boolean;
  mode: 'depth' | 'normal';
}

// Binds the optional tangent-space normal map (on texture unit 0) and its scale for the normal-mode
// debug material. The caller has already selected the program (beginGlMeshDraw) and set the
// view-projection. A no-op when no map is bound; depth mode never calls this.
export function bindGlDebugNormalMap(
  state: GlRenderState,
  program: Readonly<GlDebugProgram>,
  normalMap: Readonly<Texture> | null,
  normalScale: number,
): void {
  const gl = state.gl;
  gl.uniform1f(program.locNormalScale, normalScale);

  if (normalMap !== null && normalMap.image !== null && normalMap.image.source !== null) {
    gl.activeTexture(gl.TEXTURE0);
    bindGlTexture(state, normalMap.image.source, normalMap.sampler);
    gl.uniform1i(program.locNormalMap, 0);
  }
}

// Uploads the depth-mode linearization range (the [near, far] eye-space window mapped to [0, 1]).
// The caller has already selected the program and set the view-projection. Normal mode never calls
// this.
export function bindGlDebugRange(
  state: GlRenderState,
  program: Readonly<GlDebugProgram>,
  near: number,
  far: number,
): void {
  const gl = state.gl;
  gl.uniform1f(program.locNear, near);
  gl.uniform1f(program.locFar, far);
}

// A short, stable, order-independent string identity for a debug define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
export function buildGlDebugDefineKey(key: Readonly<GlDebugDefineKey>): string {
  return `${key.mode === 'depth' ? 'd' : 'n'}${key.hasNormalMap ? 'm' : '-'}`;
}

// Compiles the debug shader for a define key, links it, and resolves its uniform locations. Pure GL
// work — no caching — used by ensureGlDebugProgram.
export function compileGlDebugProgram(gl: WebGL2RenderingContext, key: Readonly<GlDebugDefineKey>): GlDebugProgram {
  const program = compileGlProgram(gl, getGlDebugVertexSourceForKey(key), getGlDebugFragmentSourceForKey(key));
  return {
    locFar: gl.getUniformLocation(program, 'u_far'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNear: gl.getUniformLocation(program, 'u_near'),
    locNormalMap: gl.getUniformLocation(program, 'u_normalMap'),
    locNormalMatrix: gl.getUniformLocation(program, 'u_normalMatrix'),
    locNormalScale: gl.getUniformLocation(program, 'u_normalScale'),
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

// Resolves the debug program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `debug:` family namespace.
export function ensureGlDebugProgram(state: GlRenderState, key: Readonly<GlDebugDefineKey>): GlDebugProgram {
  return ensureGlSceneProgram(state, `debug:${buildGlDebugDefineKey(key)}`, (gl) => compileGlDebugProgram(gl, key));
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlDebugFragmentSourceForKey(key: Readonly<GlDebugDefineKey>): string {
  return buildDefineSource(key) + DEBUG_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlDebugVertexSourceForKey(key: Readonly<GlDebugDefineKey>): string {
  return buildDefineSource(key) + DEBUG_VERTEX_BODY;
}

function buildDefineSource(key: Readonly<GlDebugDefineKey>): string {
  let defines = '#version 300 es\n';
  if (key.mode === 'depth') defines += '#define DEPTH_MODE\n';
  else defines += '#define NORMAL_MODE\n';
  if (key.hasNormalMap) defines += '#define HAS_NORMAL_MAP\n';
  return defines;
}

const DEBUG_VERTEX_BODY = `
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

const DEBUG_FRAGMENT_BODY = `
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

#ifdef DEPTH_MODE
uniform float u_near;
uniform float u_far;
#endif
#ifdef NORMAL_MODE
uniform float u_normalScale;
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif
#endif

uniform float u_objectAlpha;

out vec4 fragColor;

void main() {
#ifdef DEPTH_MODE
  // Linear view-space distance is the perspective w: 1.0 / gl_FragCoord.w == w_clip == eye distance.
  // This is camera-agnostic (no camera near/far needed); map it across the material's [u_near, u_far]
  // visualization window to grayscale [0, 1].
  float eyeDepth = 1.0 / gl_FragCoord.w;
  float d = clamp((eyeDepth - u_near) / max(u_far - u_near, 1e-6), 0.0, 1.0);
  fragColor = vec4(vec3(d), 1.0);
#endif
#ifdef NORMAL_MODE
  // Visualize the WORLD-space surface normal (the geometric normal carried through u_normalMatrix).
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

  fragColor = vec4(normal * 0.5 + 0.5, 1.0);
#endif
  fragColor.a *= u_objectAlpha;
}
`;
