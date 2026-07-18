import type { ImageResource } from '@flighthq/types';

// Texel-upload primitives for one texture region. Each writes into `texture` at `origin` (the [x, y, z]
// where z selects a cube-array layer / cube face). The wgpu mirror of render-gl's glTextureUpload; the
// caller owns texture creation and format.

// Uploads rgba8 CPU pixels through queue.writeTexture — the portable bedrock upload, reimplemented 1:1 by
// a native backend. `bytesPerRow` is width*4: a tightly-packed rgba8unorm (4 bytes/texel) region, which is
// exactly what a Surface's `data` holds.
export function uploadWgpuTextureData(
  device: GPUDevice,
  texture: GPUTexture,
  origin: GPUOrigin3D,
  width: number,
  height: number,
  data: Readonly<Uint8ClampedArray<ArrayBuffer>>,
): void {
  device.queue.writeTexture(
    { texture, origin },
    data as Uint8ClampedArray<ArrayBuffer>,
    { bytesPerRow: width * 4, rowsPerImage: height },
    [width, height, 1],
  );
}

// Uploads a decoded DOM element through queue.copyExternalImageToTexture — the web fast-path (GPU-side
// copy, no CPU staging). Absent on non-web hosts.
export function uploadWgpuTextureElement(
  device: GPUDevice,
  texture: GPUTexture,
  origin: GPUOrigin3D,
  width: number,
  height: number,
  source: GPUCopyExternalImageSource,
): void {
  device.queue.copyExternalImageToTexture({ source }, { texture, origin }, [width, height, 1]);
}

// Dispatches an ImageResource to the element fast-path when a decoded `source` is present, else the
// portable `data` path (a generated Surface). Assumes the resource has pixels in at least one form.
export function uploadWgpuTextureImageResource(
  device: GPUDevice,
  texture: GPUTexture,
  origin: GPUOrigin3D,
  image: Readonly<ImageResource>,
): void {
  if (image.source !== null) {
    uploadWgpuTextureElement(
      device,
      texture,
      origin,
      image.width,
      image.height,
      image.source as GPUCopyExternalImageSource,
    );
  } else {
    uploadWgpuTextureData(device, texture, origin, image.width, image.height, image.data!);
  }
}
