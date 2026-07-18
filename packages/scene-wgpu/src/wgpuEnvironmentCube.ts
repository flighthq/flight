import { uploadWgpuTextureImageResource } from '@flighthq/render-wgpu';
import type { CubeTexture, Environment, ImageResource, WgpuRenderState } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// Uploads an Environment's source radiance cubemap (six ImageResource faces) to a wgpu cube texture,
// caching it on the scene runtime. Returns null when the environment has no complete cube — all six faces
// bound with pixels, either a decoded `source` element or raw `data` — which callers treat as "no
// environment this frame". Each face uploads through whichever representation it carries:
// copyExternalImageToTexture for a `source`, or queue.writeTexture for a data-only face (a generated
// Surface, e.g. the skybox's rotateSurface180 path, which never allocates a canvas). The WGSL mirror of
// scene-gl's ensureGlEnvironmentSourceCube. The upload is keyed by identity: re-uploaded only when the
// cached view is absent (a changed cube must drop the cache first via destroyWgpuSceneIbl). The faces are
// stored sRGB-encoded (rgba8unorm) and decoded to linear by the bake/skybox shaders that sample them,
// matching scene-gl's sRGB-passthrough convention (the GL path uploads UNSIGNED_BYTE + decodes in-shader).
// Returns the cube-dimension GPUTextureView the bake + skybox sample. The source cube is a non-GC GPU
// resource freed by destroyWgpuSceneIbl.
export function ensureWgpuEnvironmentSourceCube(
  state: WgpuRenderState,
  environment: Readonly<Environment>,
): GPUTextureView | null {
  const scene = getWgpuSceneRuntime(state);
  if (scene.environmentSourceCubeView !== null) return scene.environmentSourceCubeView;

  const cube = environment.environment;
  if (cube === null || !hasWgpuCubeFacePixels(cube)) return null;

  // Cube textures must be square; every face shares the +X face's dimensions (a well-formed cube).
  const size = cube.faces[0]!.width;
  const device = state.device;
  const texture = device.createTexture({
    size: [size, size, 6],
    format: ENVIRONMENT_CUBE_FORMAT,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  // Each face uploads into its array layer, in the canonical +X, -X, +Y, -Y, +Z, -Z order (the array-layer
  // index IS the face index — the wgpu counterpart of GL's CUBE_MAP_POSITIVE_X + face).
  for (let face = 0; face < 6; face++) {
    uploadWgpuTextureImageResource(device, texture, [0, 0, face], cube.faces[face]!);
  }

  const view = texture.createView({ dimension: 'cube' });
  scene.environmentSourceCube = texture;
  scene.environmentSourceCubeView = view;
  return view;
}

// Restamps a single face of the already-built source cube in place, uploading whichever representation the
// image carries (element or generated `data`). The incremental counterpart of the all-six
// ensureWgpuEnvironmentSourceCube — for dynamic cube content (reflection probes, a live sky face, or a
// generated data face mixed into loaded ones) without dropping and rebuilding the whole cube. `face` is the
// CubeFace* index (+X, -X, +Y, -Y, +Z, -Z). Returns false when no cube has been built yet — the caller
// must call ensureWgpuEnvironmentSourceCube first.
export function updateWgpuEnvironmentCubeFace(
  state: WgpuRenderState,
  face: number,
  image: Readonly<ImageResource>,
): boolean {
  const texture = getWgpuSceneRuntime(state).environmentSourceCube;
  if (texture === null) return false;
  uploadWgpuTextureImageResource(state.device, texture, [0, 0, face], image);
  return true;
}

// A face is uploadable when it carries pixels in either representation: a decoded `source` element or
// raw CPU `data` (a generated Surface). A cube is complete only when all six faces are uploadable.
function hasWgpuCubeFacePixels(cube: Readonly<CubeTexture>): boolean {
  for (let face = 0; face < 6; face++) {
    const image = cube.faces[face];
    if (image == null || (image.source == null && image.data == null)) return false;
  }
  return true;
}

// The source radiance cube is stored sRGB-encoded (not rgba8unorm-srgb): the bake/skybox shaders decode it
// to linear themselves via srgbToLinear, exactly as scene-gl's shaders do, so the two backends agree.
const ENVIRONMENT_CUBE_FORMAT: GPUTextureFormat = 'rgba8unorm';
