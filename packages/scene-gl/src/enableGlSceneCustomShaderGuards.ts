import { logOnce } from '@flighthq/log';
import type { GlRenderState } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';

// Returns whether the scene custom-shader guard is installed on `state` (enableGlSceneCustomShaderGuards).
export function areGlSceneCustomShaderGuardsEnabled(state: GlRenderState): boolean {
  return getGlSceneRuntime(state).customShaderGuard != null;
}

// Installs the shakeable custom-shader material guard on `state`. When a CustomShaderMaterial's program
// is bound, the guard introspects its active uniforms and warns once per shader when a built-in uniform
// (u_model/u_viewProjection/u_normalMatrix/u_cameraPosition) is declared with a type the renderer does
// not upload. The dominant footgun is u_normalMatrix: the renderer uploads it as mat3 (glUniformMatrix3fv),
// so a shader declaring `mat4 u_normalMatrix` raises a silent GL_INVALID_OPERATION on every draw and
// renders nothing. The custom-shader renderer reaches this guard only through a nullable runtime slot, so
// the production draw path references no message and no @flighthq/log dependency. Idempotent.
export function enableGlSceneCustomShaderGuards(state: GlRenderState): void {
  getGlSceneRuntime(state).customShaderGuard = warnGlCustomShaderUniformTypes;
}

// Maps a GL uniform-type enum to its GLSL type keyword, so a warning names the type a shader must declare
// rather than a raw enum. Only the types the built-in uniforms use (and their nearest neighbors) are named;
// anything else falls back to the raw enum so the message is still actionable.
function glUniformTypeName(gl: Readonly<WebGL2RenderingContext>, type: number): string {
  switch (type) {
    case gl.FLOAT_MAT4:
      return 'mat4';
    case gl.FLOAT_MAT3:
      return 'mat3';
    case gl.FLOAT_MAT2:
      return 'mat2';
    case gl.FLOAT_VEC4:
      return 'vec4';
    case gl.FLOAT_VEC3:
      return 'vec3';
    case gl.FLOAT_VEC2:
      return 'vec2';
    case gl.FLOAT:
      return 'float';
    default:
      return `gl-type-${type}`;
  }
}

// Introspects a just-bound custom-shader program's active uniforms and warns once per (shader, uniform)
// when a built-in uniform's declared type differs from what drawGlMeshSubset uploads. Only active (used)
// uniforms are reported by getActiveUniform, so a declared-but-unused u_normalMatrix — which the renderer
// skips anyway (its location resolves null) — never trips the guard. Programs are checked once (cached in
// a WeakSet) so repeated per-frame binds do not re-introspect.
function warnGlCustomShaderUniformTypes(state: GlRenderState, program: WebGLProgram, shaderKey: string): void {
  if (_checkedPrograms.has(program)) return;
  _checkedPrograms.add(program);

  const gl = state.gl;
  const expected = new Map<string, number>([
    ['u_model', gl.FLOAT_MAT4],
    ['u_viewProjection', gl.FLOAT_MAT4],
    ['u_normalMatrix', gl.FLOAT_MAT3],
    ['u_cameraPosition', gl.FLOAT_VEC3],
  ]);

  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info === null) continue;
    const want = expected.get(info.name);
    if (want === undefined || info.type === want) continue;
    logOnce(
      `scene-gl:custom-shader-uniform-type:${shaderKey}:${info.name}`,
      LogLevel.Warn,
      {
        message: `customShaderGlMeshMaterialRenderer: shader "${shaderKey}" declares ${info.name} as ${glUniformTypeName(gl, info.type)} but the renderer uploads it as ${glUniformTypeName(gl, want)} — the mismatched upload raises a silent GL_INVALID_OPERATION and the draw is dropped. Declare '${glUniformTypeName(gl, want)} ${info.name}' in the shader.`,
      },
      'scene-gl',
    );
  }
}

const _checkedPrograms = new WeakSet<WebGLProgram>();
