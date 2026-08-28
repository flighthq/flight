import { uploadGlTextureData, uploadGlTextureImageResource } from '@flighthq/render-gl/contract';
import type {
  GlContext,
  Bitmap,
  Environment,
  GlRenderState,
  TextureSource,
  Image,
  Texture,
} from '@flighthq/types/contract';
import { BitmapTextureSourceKind, ImageTextureSourceKind } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime';

// Uploads an Environment's source radiance cubemap (six Image faces) to a GL cubemap texture,
// caching it on the scene runtime. Returns null when the environment has no complete cube — all six
// faces bound with pixels, either a decoded `source` element or raw `data` — which callers treat as
// "no environment this frame". Each face uploads through whichever representation it carries: the
// element overload for a `source`, or the raw-pixel overload for a data-only face (a generated
// Bitmap, e.g. the skybox's rotateBitmap180 path, which never allocates a canvas). The upload is
// keyed by identity: re-uploaded only when the cached texture is absent (a changed cube must drop the
// cache first via destroyGlEnvironment). Texture.colorSpace selects the cube's GPU internal format,
// so hardware sampling performs sRGB-to-linear decode only for an sRGB cube.
export function ensureGlEnvironmentSourceCube(
  state: GlRenderState,
  environment: Readonly<Environment>,
): WebGLTexture | null {
  const runtime = getGlScene3DRuntime(state);
  if (runtime.environmentSourceCube !== null) return runtime.environmentSourceCube;

  const cube = environment.environment;
  if (cube === null || cube.dimension !== 'cube' || !hasGlCubeFacePixels(cube)) return null;
  const sources = cube.sources;

  const gl = state.gl;
  const internalFormat = cube.colorSpace === 'srgb' ? gl.SRGB8_ALPHA8 : gl.RGBA;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  for (let face = 0; face < 6; face++) {
    uploadGlEnvironmentImage(gl, getGlCubeFaceTarget(gl, face), sources[face]!, internalFormat);
  }
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

  runtime.environmentSourceCube = texture;
  runtime.environmentSourceCubeColorSpace = cube.colorSpace;
  return texture;
}

// The cubemap face target in Texture.sources order (+X, -X, +Y, -Y, +Z, -Z), which is exactly
// gl.TEXTURE_CUBE_MAP_POSITIVE_X + face. Face loops call this rather than hardcoding the GL enum math.
export function getGlCubeFaceTarget(gl: GlContext, face: number): number {
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
  image: Readonly<TextureSource>,
): boolean {
  const runtime = getGlScene3DRuntime(state);
  const texture = runtime.environmentSourceCube;
  if (texture === null) return false;
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  uploadGlEnvironmentImage(
    gl,
    getGlCubeFaceTarget(gl, face),
    image,
    runtime.environmentSourceCubeColorSpace === 'srgb' ? gl.SRGB8_ALPHA8 : gl.RGBA,
  );
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  return true;
}

// A face is uploadable when it carries pixels in either representation: a decoded `source` element or
// raw CPU `data` (a generated Bitmap). A cube is complete only when all six faces are uploadable.
function hasGlCubeFacePixels(cube: Readonly<Texture>): boolean {
  if (cube.dimension !== 'cube') return false;
  for (let face = 0; face < 6; face++) {
    const image = cube.sources[face];
    if (image === null || (image.kind !== ImageTextureSourceKind && image.kind !== BitmapTextureSourceKind)) {
      return false;
    }
  }
  return true;
}

function uploadGlEnvironmentImage(
  gl: GlContext,
  target: number,
  image: Readonly<TextureSource>,
  internalFormat: number = gl.RGBA,
): void {
  if (image.kind === BitmapTextureSourceKind) {
    const bitmap = image as Readonly<Bitmap>;
    uploadGlTextureData(gl, target, bitmap.width, bitmap.height, bitmap.data, internalFormat);
  } else {
    uploadGlTextureImageResource(gl, target, image as Readonly<Image>, internalFormat);
  }
}
