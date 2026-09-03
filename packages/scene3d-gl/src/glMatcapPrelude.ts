import { resolveGlTexture } from '@flighthq/render-gl/contract';
import type {
  GlContext,
  GlMatcapDefineKey,
  GlMatcapProgram,
  LinearColor,
  GlRenderState,
  Texture,
} from '@flighthq/types/contract';

import { GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS } from './glMeshFragmentTail';
import {
  compileGlProgram,
  ensureGlScene3DProgram,
  GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
} from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';
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

  if (matcap !== null) {
    gl.activeTexture(gl.TEXTURE0);
    if (resolveGlTexture(state, matcap) !== null) gl.uniform1i(program.locMatcap, 0);
  }
}

// A short, stable, order-independent string identity for a matcap define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
export function buildGlMatcapDefineKey(key: Readonly<GlMatcapDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.hasMatcap ? 't' : '-'}${key.hasSkin ? 'k' : '-'}${key.hasInstances ? 'i' : '-'}`;
}

// Compiles the matcap shader for a define key, links it, and resolves its uniform locations. Pure GL
// work — no caching — used by ensureGlMatcapProgram.
export function compileGlMatcapProgram(gl: GlContext, key: Readonly<GlMatcapDefineKey>): GlMatcapProgram {
  const program = compileGlProgram(gl, getGlMatcapVertexSourceForKey(key), getGlMatcapFragmentSourceForKey(key));
  return {
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locJointNormalTexture: gl.getUniformLocation(program, 'u_jointNormalTexture'),
    locJointTexture: gl.getUniformLocation(program, 'u_jointTexture'),
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
  const fullKey: GlMatcapDefineKey = {
    ...key,
    hasInstances: getGlScene3DRuntime(state).activeInstancedRun,
    hasSkin: getGlScene3DRuntime(state).activeSkinnedRun,
  };
  return ensureGlScene3DProgram(state, `matcap:${buildGlMatcapDefineKey(fullKey)}`, (gl) =>
    compileGlMatcapProgram(gl, fullKey),
  );
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlMatcapFragmentSourceForKey(key: Readonly<GlMatcapDefineKey>): string {
  return buildDefineSource(key) + MATCAP_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlMatcapVertexSourceForKey(key: Readonly<GlMatcapDefineKey>): string {
  const skin = key.hasSkin ? GL_SKIN_VERTEX_DECLARATIONS_GLSL : '';
  const instances = key.hasInstances ? GL_INSTANCE_VERTEX_DECLARATIONS_GLSL : '';
  return buildDefineSource(key) + skin + instances + MATCAP_VERTEX_BODY;
}

function buildDefineSource(key: Readonly<GlMatcapDefineKey>): string {
  let defines = '#version 300 es\n';
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasMatcap) defines += '#define HAS_MATCAP\n';
  if (key.hasSkin) defines += '#define HAS_SKIN\n';
  if (key.hasInstances) defines += '#define HAS_INSTANCES\n';
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
#ifdef HAS_SKIN
  mat4 skin = skinMatrix();
  vec4 localPosition = skin * vec4(a_position, 1.0);
  vec3 localNormal = skinNormalMatrix() * a_normal;
#else
  vec4 localPosition = vec4(a_position, 1.0);
  vec3 localNormal = a_normal;
#endif
#ifdef HAS_INSTANCES
  mat4 instanceModel = u_model * instanceModelMatrix();
  vec4 worldPosition = instanceModel * localPosition;
  // mat3(instanceModel) approximates the normal transform for instanced draws (correct under
  // rotation and uniform scale — non-uniform per-instance scale would need the inverse-transpose,
  // which the instance buffer does not carry).
  v_viewNormal = mat3(u_view) * (mat3(instanceModel) * localNormal);
#else
  vec4 worldPosition = u_model * localPosition;
  // u_normalMatrix takes the object normal into world space (handles model rotation/scale);
  // mat3(u_view) rotates it into view space. Normalized in the fragment scene2d.
  v_viewNormal = mat3(u_view) * (u_normalMatrix * localNormal);
#endif
  gl_Position = u_viewProjection * worldPosition;
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

${GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

// Texture.colorSpace selects the GPU format, so sampled matcap color is already linear here.
void main() {
  vec4 color = u_tint;
#ifdef HAS_MATCAP
  // The view-space normal projected to 2D indexes the prebaked-lit sphere: uv = n.xy * 0.5 + 0.5.
  vec3 viewNormal = normalize(v_viewNormal);
  vec2 matcapUv = viewNormal.xy * 0.5 + 0.5;
  vec4 sampled = texture(u_matcap, matcapUv);
  color.rgb *= sampled.rgb;
  color.a *= sampled.a;
#endif
#ifdef ALPHA_MASK
  if (color.a < u_alphaCutoff) discard;
  color.a = 1.0;
#endif
  fragColor = color;
${GL_MESH_FRAGMENT_TAIL}
}
`;
