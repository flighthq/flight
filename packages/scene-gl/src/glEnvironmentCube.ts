import { uploadGlTextureImageResource } from '@flighthq/render-gl';
import type { CubeTexture, Environment, GlRenderState, ImageResource } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';

// Uploads an Environment's source radiance cubemap (six ImageResource faces) to a GL cubemap texture,
// caching it on the scene runtime. Returns null when the environment has no complete cube — all six
// faces bound with pixels, either a decoded `source` element or raw `data` — which callers treat as
// "no environment this frame". Each face uploads through whichever representation it carries: the
// element overload for a `source`, or the raw-pixel overload for a data-only face (a generated
// Surface, e.g. the skybox's rotateSurface180 path, which never allocates a canvas). The upload is
// keyed by identity: re-uploaded only when the cached texture is absent (a changed cube must drop the
// cache first via destroyGlEnvironment). sRGB faces are decoded to linear by the shaders that sample
// them, matching the renderer's sRGB-passthrough convention.
export function ensureGlEnvironmentSourceCube(
  state: GlRenderState,
  environment: Readonly<Environment>,
): WebGLTexture | null {
  const runtime = getGlSceneRuntime(state);
  if (runtime.environmentSourceCube !== null) return runtime.environmentSourceCube;

  const cube = environment.environment;
  if (cube === null || !hasGlCubeFacePixels(cube)) return null;

  const gl = state.gl;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  for (let face = 0; face < 6; face++) {
    uploadGlTextureImageResource(gl, getGlCubeFaceTarget(gl, face), cube.faces[face]!);
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
export function getGlCubeFaceTarget(gl: WebGL2RenderingContext, face: number): number {
  return gl.TEXTURE_CUBE_MAP_POSITIVE_X + face;
}

// Restamps a single face of the already-built source cube in place, uploading whichever representation the
// image carries (element or generated `data`). This is the incremental counterpart of the all-six
// ensureGlEnvironmentSourceCube — for dynamic cube content (reflection probes, a live sky face, or a
// generated data face mixed into loaded ones) without dropping and rebuilding the whole cube. `face` is the
// CubeFace* index (+X, -X, +Y, -Y, +Z, -Z). Returns false when no cube has been built yet — the caller
// must call ensureGlEnvironmentSourceCube first.
export function updateGlEnvironmentCubeFace(
  state: GlRenderState,
  face: number,
  image: Readonly<ImageResource>,
): boolean {
  const texture = getGlSceneRuntime(state).environmentSourceCube;
  if (texture === null) return false;
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  uploadGlTextureImageResource(gl, getGlCubeFaceTarget(gl, face), image);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  return true;
}

// A face is uploadable when it carries pixels in either representation: a decoded `source` element or
// raw CPU `data` (a generated Surface). A cube is complete only when all six faces are uploadable.
function hasGlCubeFacePixels(cube: Readonly<CubeTexture>): boolean {
  for (let face = 0; face < 6; face++) {
    const image = cube.faces[face];
    if (image == null || (image.source == null && image.data == null)) return false;
  }
  return true;
}
