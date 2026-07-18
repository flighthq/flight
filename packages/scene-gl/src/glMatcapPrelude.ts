import type { LinearColor } from '@flighthq/color';
import { bindGlTexture } from '@flighthq/render-gl';
import type { GlRenderState, Texture } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';
import { compileGlProgram, ensureGlSceneProgram } from './glMeshProgram';

// The shared Gl matcap prelude: the GLSL 300 es vertex + fragment shader for the lighting-
// independent Matcap (material-capture) material. A matcap is a prebaked-lit sphere texture; the
// fragment stage samples it by the view-space normal projected to 2D (uv = viewNormal.xy * 0.5 +
// 0.5), giving full stylized "lighting" with no scene lights. The view-space normal is built in the
// vertex stage as `mat3(u_view) * (u_normalMatrix * a_normal)`: the normal matrix takes the object
// normal into world space (handling model rotation/scale), and the camera view matrix rotates it
// into view space. The output is LINEAR — the sampled matcap rgb is sRgb-decoded in the shader and
// multiplied by the linear `tint` (already sRgb-decoded on the CPU via unpackColorToLinear, so the
// shader never decodes the tint again). The effect pipeline owns tonemap/gamma. One source string is
// specialized per material at compile time by a define block (see GlMatcapDefineKey): the matcap /
// alpha-mask variants are #ifdef branches of one shader, never separate files.

// The feature flags that select a matcap variant. `hasMatcap` enables the sampled matcap texture
// (when absent the shader outputs the tint alone); `alphaMaskEnabled` enables the alpha-cutoff
// discard for 'mask' materials.
export interface GlMatcapDefineKey {
  alphaMaskEnabled: boolean;
  hasMatcap: boolean;
}

// A compiled matcap variant plus its resolved uniform locations. Extends GlMeshProgram with the
// matcap fragment/vertex uniforms: `locView` (the camera view matrix, used to rotate the world-space
// normal into view space) and `locNormalMatrix` (resolved from u_normalMatrix — matcap needs the
// normal, unlike the unlit family). One exists per distinct GlMatcapDefineKey, cached on the
// GlRenderState under the `matcap:` program-cache namespace.
export interface GlMatcapProgram extends GlMeshProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locMatcap: WebGLUniformLocation | null;
  locTint: WebGLUniformLocation | null;
  locView: WebGLUniformLocation | null;
}

// Uploads the resolved matcap surface uniforms: the linear tint (already sRgb-decoded on the CPU),
// the optional matcap texture on texture unit 0, and the alpha-mask cutoff. The caller has already
// selected the program (beginGlMeshDraw), set the view-projection, and uploaded u_view.
export function bindGlMatcapSurface(
  state: GlRenderState,
  program: Readonly<GlMatcapProgram>,
  tint: Readonly<LinearColor>,
  matcap: Readonly<Texture> | null,
  alphaCutoff: number,
): void {
  const gl = state.gl;
  gl.uniform4f(program.locTint, tint[0], tint[1], tint[2], tint[3]);
  gl.uniform1f(program.locAlphaCutoff, alphaCutoff);

  if (matcap !== null && matcap.image !== null && matcap.image.source !== null) {
    gl.activeTexture(gl.TEXTURE0);
    bindGlTexture(state, matcap.image.source, matcap.sampler.wrapU, matcap.sampler.wrapV);
    gl.uniform1i(program.locMatcap, 0);
  }
}

// A short, stable, order-independent string identity for a matcap define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
export function buildGlMatcapDefineKey(key: Readonly<GlMatcapDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.hasMatcap ? 't' : '-'}`;
}

// Compiles the matcap shader for a define key, links it, and resolves its uniform locations. Pure GL
// work — no caching — used by ensureGlMatcapProgram.
export function compileGlMatcapProgram(gl: WebGL2RenderingContext, key: Readonly<GlMatcapDefineKey>): GlMatcapProgram {
  const program = compileGlProgram(gl, getGlMatcapVertexSourceForKey(key), getGlMatcapFragmentSourceForKey(key));
  return {
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locMatcap: gl.getUniformLocation(program, 'u_matcap'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: gl.getUniformLocation(program, 'u_normalMatrix'),
    locTint: gl.getUniformLocation(program, 'u_tint'),
    locView: gl.getUniformLocation(program, 'u_view'),
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

// Resolves the matcap program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `matcap:` family namespace.
export function ensureGlMatcapProgram(state: GlRenderState, key: Readonly<GlMatcapDefineKey>): GlMatcapProgram {
  return ensureGlSceneProgram(state, `matcap:${buildGlMatcapDefineKey(key)}`, (gl) => compileGlMatcapProgram(gl, key));
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlMatcapFragmentSourceForKey(key: Readonly<GlMatcapDefineKey>): string {
  return buildDefineSource(key) + MATCAP_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlMatcapVertexSourceForKey(key: Readonly<GlMatcapDefineKey>): string {
  return buildDefineSource(key) + MATCAP_VERTEX_BODY;
}

function buildDefineSource(key: Readonly<GlMatcapDefineKey>): string {
  let defines = '#version 300 es\n';
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasMatcap) defines += '#define HAS_MATCAP\n';
  return defines;
}

const MATCAP_VERTEX_BODY = `
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat4 u_view;
uniform mat3 u_normalMatrix;

out vec3 v_viewNormal;

void main() {
  // u_normalMatrix takes the object normal into world space (handles model rotation/scale);
  // mat3(u_view) rotates it into view space. Normalized in the fragment stage.
  v_viewNormal = mat3(u_view) * (u_normalMatrix * a_normal);
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}
`;

const MATCAP_FRAGMENT_BODY = `
precision highp float;

in vec3 v_viewNormal;

uniform vec4 u_tint;
#ifdef HAS_MATCAP
uniform sampler2D u_matcap;
#endif
#ifdef ALPHA_MASK
uniform float u_alphaCutoff;
#endif

uniform float u_objectAlpha;

out vec4 fragColor;

// sRgb texels are gamma-encoded; decode to linear before use. u_tint is already linear (decoded on
// the CPU at bind), so only the sampled matcap needs decoding.
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

void main() {
  vec4 color = u_tint;
#ifdef HAS_MATCAP
  // The view-space normal projected to 2D indexes the prebaked-lit sphere: uv = n.xy * 0.5 + 0.5.
  vec3 viewNormal = normalize(v_viewNormal);
  vec2 matcapUv = viewNormal.xy * 0.5 + 0.5;
  vec4 sampled = texture(u_matcap, matcapUv);
  color.rgb *= srgbToLinear(sampled.rgb);
  color.a *= sampled.a;
#endif
#ifdef ALPHA_MASK
  if (color.a < u_alphaCutoff) discard;
#endif
  fragColor = color;
  fragColor.a *= u_objectAlpha;
}
`;
