import type { CubeTexture, Environment, GlRenderState } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';

// Uploads an Environment's source radiance cubemap (six ImageResource faces) to a GL cubemap texture,
// caching it on the scene runtime. Returns null when the environment has no complete cube — all six
// faces bound with a decoded `source` — which callers treat as "no environment this frame". The upload
// is keyed by identity: re-uploaded only when the cached texture is absent (a changed cube must drop
// the cache first via destroyGlEnvironment). sRGB faces are decoded to linear by the shaders that
// sample them, matching the renderer's sRGB-passthrough convention.
export function ensureGlEnvironmentSourceCube(
  state: GlRenderState,
  environment: Readonly<Environment>,
): WebGLTexture | null {
  const runtime = getGlSceneRuntime(state);
  if (runtime.environmentSourceCube !== null) return runtime.environmentSourceCube;

  const cube = environment.environment;
  if (cube === null || !hasGlCubeFaceSources(cube)) return null;

  const gl = state.gl;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  for (let face = 0; face < 6; face++) {
    gl.texImage2D(
      glCubeFaceTarget(gl, face),
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      cube.faces[face]!.source as TexImageSource,
    );
  }
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

  runtime.environmentSourceCube = texture;
  return texture;
}

// The cubemap face target in CubeTexture.faces order (+X, -X, +Y, -Y, +Z, -Z), which is exactly
// gl.TEXTURE_CUBE_MAP_POSITIVE_X + face. Face loops call this rather than hardcoding the GL enum math.
export function glCubeFaceTarget(gl: WebGL2RenderingContext, face: number): number {
  return gl.TEXTURE_CUBE_MAP_POSITIVE_X + face;
}

function hasGlCubeFaceSources(cube: Readonly<CubeTexture>): boolean {
  for (let face = 0; face < 6; face++) if (cube.faces[face]?.source == null) return false;
  return true;
}
