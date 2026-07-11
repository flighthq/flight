import type { CubeTexture, Environment, WgpuRenderState } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// Uploads an Environment's source radiance cubemap (six ImageResource faces) to a wgpu cube texture,
// caching it on the scene runtime. Returns null when the environment has no complete cube — all six faces
// bound with a decoded `source` — which callers treat as "no environment this frame". The WGSL mirror of
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
  if (cube === null || !hasWgpuCubeFaceSources(cube)) return null;

  // Cube textures must be square; every face shares the +X face's dimensions (a well-formed cube).
  const size = cube.faces[0]!.width;
  const device = state.device;
  const texture = device.createTexture({
    size: [size, size, 6],
    format: ENVIRONMENT_CUBE_FORMAT,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  // Each face's source element uploads into its array layer, in the canonical +X, -X, +Y, -Y, +Z, -Z
  // order (the array-layer index IS the face index — the wgpu counterpart of GL's CUBE_MAP_POSITIVE_X + face).
  for (let face = 0; face < 6; face++) {
    const image = cube.faces[face]!;
    device.queue.copyExternalImageToTexture(
      { source: image.source as GPUCopyExternalImageSource },
      { texture, origin: [0, 0, face] },
      [image.width, image.height, 1],
    );
  }

  const view = texture.createView({ dimension: 'cube' });
  scene.environmentSourceCube = texture;
  scene.environmentSourceCubeView = view;
  return view;
}

function hasWgpuCubeFaceSources(cube: Readonly<CubeTexture>): boolean {
  for (let face = 0; face < 6; face++) if (cube.faces[face]?.source == null) return false;
  return true;
}

// The source radiance cube is stored sRGB-encoded (not rgba8unorm-srgb): the bake/skybox shaders decode it
// to linear themselves via srgbToLinear, exactly as scene-gl's shaders do, so the two backends agree.
const ENVIRONMENT_CUBE_FORMAT: GPUTextureFormat = 'rgba8unorm';
