import type { GlRenderState } from '@flighthq/types';

import type { GlPbrDefineKey } from './glPbrPrelude';
import { buildGlPbrDefineKey, getGlPbrFragmentSourceForKey, getGlPbrVertexSourceForKey } from './glPbrPrelude';
import { getGlSceneRuntime } from './glSceneRuntime';

// A compiled StandardPbr uber-shader variant plus its resolved uniform locations. One of these
// exists per distinct GlPbrDefineKey (maps-present / alpha-mask combination), built once and cached
// on the GlRenderState (see ensureGlPbrProgram). The vertex attribute locations are fixed by the
// shader's `layout(location = …)` qualifiers (0 position, 1 normal, 2 tangent, 3 uv0), so they are
// not stored here — the draw path binds them by constant.
export interface GlPbrProgram {
  program: WebGLProgram;
  locViewProjection: WebGLUniformLocation | null;
  locModel: WebGLUniformLocation | null;
  locNormalMatrix: WebGLUniformLocation | null;
  locBaseColor: WebGLUniformLocation | null;
  locMetallic: WebGLUniformLocation | null;
  locRoughness: WebGLUniformLocation | null;
  locNormalScale: WebGLUniformLocation | null;
  locEmissive: WebGLUniformLocation | null;
  locEmissiveStrength: WebGLUniformLocation | null;
  locAlphaCutoff: WebGLUniformLocation | null;
  locCameraPosition: WebGLUniformLocation | null;
  locDirectional: WebGLUniformLocation | null;
  locDirectionalRadiance: WebGLUniformLocation | null;
  locAmbientRadiance: WebGLUniformLocation | null;
  locDirectionalCount: WebGLUniformLocation | null;
  locAmbientCount: WebGLUniformLocation | null;
  locBaseColorMap: WebGLUniformLocation | null;
  locNormalMap: WebGLUniformLocation | null;
}

// Compiles the StandardPbr uber-shader for a define key, links it, and resolves its uniform
// locations. Pure GL work — no caching — used by ensureGlPbrProgram. Throws on a compile/link
// failure, which is a programmer error (a malformed prelude), not an expected runtime condition.
export function compileGlPbrProgram(gl: WebGL2RenderingContext, key: Readonly<GlPbrDefineKey>): GlPbrProgram {
  const vertexSource = getGlPbrVertexSourceForKey(key);
  const fragmentSource = getGlPbrFragmentSourceForKey(key);
  const program = linkGlPbrProgram(gl, vertexSource, fragmentSource);
  return {
    program,
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: gl.getUniformLocation(program, 'u_normalMatrix'),
    locBaseColor: gl.getUniformLocation(program, 'u_baseColor'),
    locMetallic: gl.getUniformLocation(program, 'u_metallic'),
    locRoughness: gl.getUniformLocation(program, 'u_roughness'),
    locNormalScale: gl.getUniformLocation(program, 'u_normalScale'),
    locEmissive: gl.getUniformLocation(program, 'u_emissive'),
    locEmissiveStrength: gl.getUniformLocation(program, 'u_emissiveStrength'),
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locCameraPosition: gl.getUniformLocation(program, 'u_cameraPosition'),
    locDirectional: gl.getUniformLocation(program, 'u_directional'),
    locDirectionalRadiance: gl.getUniformLocation(program, 'u_directionalRadiance'),
    locAmbientRadiance: gl.getUniformLocation(program, 'u_ambientRadiance'),
    locDirectionalCount: gl.getUniformLocation(program, 'u_directionalCount'),
    locAmbientCount: gl.getUniformLocation(program, 'u_ambientCount'),
    locBaseColorMap: gl.getUniformLocation(program, 'u_baseColorMap'),
    locNormalMap: gl.getUniformLocation(program, 'u_normalMap'),
  };
}

// Resolves the StandardPbr program for a define key, compiling and caching it on first use. The
// cache is the scene-gl runtime's pbrProgramCache (a per-GlRenderState Map keyed by the define
// key's stable string), so each variant is compiled at most once per state and reused every frame.
export function ensureGlPbrProgram(state: GlRenderState, key: Readonly<GlPbrDefineKey>): GlPbrProgram {
  const runtime = getGlSceneRuntime(state);
  const cacheKey = buildGlPbrDefineKey(key);
  let program = runtime.pbrProgramCache.get(cacheKey);
  if (program === undefined) {
    program = compileGlPbrProgram(state.gl, key);
    runtime.pbrProgramCache.set(cacheKey, program);
  }
  return program;
}

function compileGlPbrShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`PBR shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function linkGlPbrProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = compileGlPbrShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileGlPbrShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`PBR program link error: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}
