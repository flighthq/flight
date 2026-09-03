import { uploadWgpuTextureData, uploadWgpuTextureImageResource } from '@flighthq/render-wgpu/contract';
import type {
  Bitmap,
  Environment,
  TextureSource,
  ImageResource,
  Texture,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { BitmapTextureSourceKind, ImageTextureSourceKind } from '@flighthq/types/contract';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';

// Uploads an Environment's source radiance cubemap (six ImageResource faces) to a wgpu cube texture,
// caching it on the scene runtime. Returns null when the environment has no complete cube — all six faces
// bound with pixels, either a decoded `source` element or raw `data` — which callers treat as "no
// environment this frame". Each face uploads through whichever representation it carries:
// copyExternalImageToTexture for a `source`, or queue.writeTexture for a data-only face (a generated
// Bitmap, e.g. the skybox's rotateBitmap180 path, which never allocates a canvas). The WGSL mirror of
// scene-gl's ensureGlEnvironmentSourceCube. The upload is keyed by identity: re-uploaded only when the
// cached view is absent (a changed cube must drop the cache first via destroyWgpuScene3DIbl).
// Texture.colorSpace selects rgba8unorm or rgba8unorm-srgb, so hardware sampling performs the decode.
// Returns the cube-dimension GPUTextureView the bake + skybox sample. The source cube is a non-GC GPU
// resource freed by destroyWgpuScene3DIbl.
export function ensureWgpuEnvironmentSourceCube(
  state: WgpuRenderState,
  environment: Readonly<Environment>,
): GPUTextureView | null {
  const scene = getWgpuScene3DRuntime(state);
  if (scene.environmentSourceCubeView !== null) return scene.environmentSourceCubeView;

  const cube = environment.environment;
  if (cube === null || cube.dimension !== 'cube' || !hasWgpuCubeFacePixels(cube)) return null;
  const sources = cube.sources;

  // Cube textures must be square; every face shares the +X face's dimensions (a well-formed cube).
  const size = sources[0]!.width;
  const device = state.device;
  const format: GPUTextureFormat = cube.colorSpace === 'srgb' ? 'rgba8unorm-srgb' : 'rgba8unorm';
  const texture = device.createTexture({
    size: [size, size, 6],
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  // Each face uploads into its array layer, in the canonical +X, -X, +Y, -Y, +Z, -Z order (the array-layer
  // index IS the face index — the wgpu counterpart of GL's CUBE_MAP_POSITIVE_X + face).
  for (let face = 0; face < 6; face++) {
    uploadWgpuEnvironmentImage(device, texture, face, sources[face]!);
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
  image: Readonly<TextureSource>,
): boolean {
  const texture = getWgpuScene3DRuntime(state).environmentSourceCube;
  if (texture === null) return false;
  uploadWgpuEnvironmentImage(state.device, texture, face, image);
  return true;
}

// A face is uploadable when it carries pixels in either representation: a decoded `source` element or
// raw CPU `data` (a generated Bitmap). A cube is complete only when all six faces are uploadable.
function hasWgpuCubeFacePixels(cube: Readonly<Texture>): boolean {
  if (cube.dimension !== 'cube') return false;
  for (let face = 0; face < 6; face++) {
    const image = cube.sources[face];
    if (image === null || (image.kind !== ImageTextureSourceKind && image.kind !== BitmapTextureSourceKind)) {
      return false;
    }
  }
  return true;
}

function uploadWgpuEnvironmentImage(
  device: GPUDevice,
  texture: GPUTexture,
  face: number,
  image: Readonly<TextureSource>,
): void {
  if (image.kind === BitmapTextureSourceKind) {
    const bitmap = image as Readonly<Bitmap>;
    uploadWgpuTextureData(device, texture, [0, 0, face], bitmap.width, bitmap.height, bitmap.data);
  } else {
    uploadWgpuTextureImageResource(device, texture, [0, 0, face], image as Readonly<ImageResource>);
  }
}
