import { resolveGlTexture } from '@flighthq/render-gl/contract';
import type { GlContext, GlDebugProgram, GlDebugDefineKey, GlRenderState, Texture } from '@flighthq/types/contract';

import { GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS } from './glMeshFragmentTail';
import {
  compileGlProgram,
  ensureGlScene3DProgram,
  GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
} from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';
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

  if (normalMap !== null) {
    gl.activeTexture(gl.TEXTURE0);
    if (resolveGlTexture(state, normalMap) !== null) gl.uniform1i(program.locNormalMap, 0);
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
  return `${key.mode === 'depth' ? 'd' : 'n'}${key.hasNormalMap ? 'm' : '-'}${key.hasSkin ? 'k' : '-'}${key.hasInstances ? 'i' : '-'}`;
}

// Compiles the debug shader for a define key, links it, and resolves its uniform locations. Pure GL
// work — no caching — used by ensureGlDebugProgram.
export function compileGlDebugProgram(gl: GlContext, key: Readonly<GlDebugDefineKey>): GlDebugProgram {
  const program = compileGlProgram(gl, getGlDebugVertexSourceForKey(key), getGlDebugFragmentSourceForKey(key));
  return {
    locFar: gl.getUniformLocation(program, 'u_far'),
    locJointNormalTexture: gl.getUniformLocation(program, 'u_jointNormalTexture'),
    locJointTexture: gl.getUniformLocation(program, 'u_jointTexture'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNear: gl.getUniformLocation(program, 'u_near'),
    locNormalMap: gl.getUniformLocation(program, 'u_normalMap'),
    locNormalMatrix: gl.getUniformLocation(program, 'u_normalMatrix'),
    locNormalScale: gl.getUniformLocation(program, 'u_normalScale'),
    locView: gl.getUniformLocation(program, 'u_view'),
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

// Resolves the debug program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `debug:` family namespace.
export function ensureGlDebugProgram(state: GlRenderState, key: Readonly<GlDebugDefineKey>): GlDebugProgram {
  const fullKey: GlDebugDefineKey = {
    ...key,
    hasInstances: getGlScene3DRuntime(state).activeInstancedRun,
    hasSkin: getGlScene3DRuntime(state).activeSkinnedRun,
  };
  return ensureGlScene3DProgram(state, `debug:${buildGlDebugDefineKey(fullKey)}`, (gl) =>
    compileGlDebugProgram(gl, fullKey),
  );
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlDebugFragmentSourceForKey(key: Readonly<GlDebugDefineKey>): string {
  return buildDefineSource(key) + DEBUG_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlDebugVertexSourceForKey(key: Readonly<GlDebugDefineKey>): string {
  const skin = key.hasSkin ? GL_SKIN_VERTEX_DECLARATIONS_GLSL : '';
  const instances = key.hasInstances ? GL_INSTANCE_VERTEX_DECLARATIONS_GLSL : '';
  return buildDefineSource(key) + skin + instances + DEBUG_VERTEX_BODY;
}

function buildDefineSource(key: Readonly<GlDebugDefineKey>): string {
  let defines = '#version 300 es\n';
  if (key.mode === 'depth') defines += '#define DEPTH_MODE\n';
  else defines += '#define NORMAL_MODE\n';
  if (key.hasNormalMap) defines += '#define HAS_NORMAL_MAP\n';
  if (key.hasSkin) defines += '#define HAS_SKIN\n';
  if (key.hasInstances) defines += '#define HAS_INSTANCES\n';
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
#ifdef DEPTH_MODE
uniform mat4 u_view;
#endif

out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;
#ifdef DEPTH_MODE
out float v_viewDepth;
#endif

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
  v_uv0 = a_uv0;
#ifdef DEPTH_MODE
  v_viewDepth = -(u_view * worldPosition).z;
#endif
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
in float v_viewDepth;
uniform float u_near;
uniform float u_far;
#endif
#ifdef NORMAL_MODE
uniform float u_normalScale;
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif
#endif

${GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

void main() {
#ifdef DEPTH_MODE
  // Positive distance along the camera's view axis, computed before projection so perspective and
  // orthographic cameras agree. Map it across the material's visualization window to grayscale.
  float d = clamp((v_viewDepth - u_near) / max(u_far - u_near, 1e-6), 0.0, 1.0);
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
${GL_MESH_FRAGMENT_TAIL}
}
`;
