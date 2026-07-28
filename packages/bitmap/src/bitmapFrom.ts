import { createEntity } from '@flighthq/entity/contract';
import type { ImageResource, Bitmap } from '@flighthq/types/contract';
import { BitmapTextureBackingKind } from '@flighthq/types/contract';

/**
 * Reads a host-backed ImageResource into a newly allocated, CPU-readable Bitmap. The readback draws
 * through a detached canvas; callers that need both representations should retain both objects.
 */
export function captureBitmapFromImageResource(resource: Readonly<ImageResource>): Bitmap {
  const canvas = document.createElement('canvas');
  canvas.width = resource.width;
  canvas.height = resource.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(resource.source, 0, 0);
  const raw = ctx.getImageData(0, 0, resource.width, resource.height);
  return createEntity({
    alphaType: 'straight',
    colorSpace: raw.colorSpace as 'srgb' | 'display-p3',
    data: raw.data,
    format: 'rgba8unorm',
    height: resource.height,
    kind: BitmapTextureBackingKind,
    version: 0,
    width: resource.width,
  });
}

export function createBitmapFromCanvas(
  canvas: HTMLCanvasElement,
  x: number = 0,
  y: number = 0,
  width?: number,
  height?: number,
): Bitmap {
  const w = width ?? canvas.width;
  const h = height ?? canvas.height;
  const ctx = canvas.getContext('2d')!;
  const raw = ctx.getImageData(x, y, w, h);
  return createEntity({
    alphaType: 'straight',
    colorSpace: raw.colorSpace as 'srgb' | 'display-p3',
    data: raw.data,
    format: 'rgba8unorm',
    height: raw.height,
    kind: BitmapTextureBackingKind,
    version: 0,
    width: raw.width,
  });
}

/**
 * Reads a bitmap out of any `CanvasImageSource` by drawing it into a scratch 2D canvas. Unlike
 * createBitmapFromCanvas — which calls getContext('2d') and so only works on a 2D-rendered canvas —
 * this captures a Gl or Wgpu canvas too, giving one readback path for every render backend.
 * `width`/`height` are the device-pixel dimensions to capture (pass the render state's canvas size).
 * For a Gl/Wgpu source, draw before the browser composites the frame away (in tests, enable the
 * context's preserveDrawingBuffer, or read immediately after rendering).
 */
export function createBitmapFromImageSource(source: CanvasImageSource, width: number, height: number): Bitmap {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  const raw = ctx.getImageData(0, 0, width, height);
  return createEntity({
    alphaType: 'straight',
    colorSpace: raw.colorSpace as 'srgb' | 'display-p3',
    data: raw.data,
    format: 'rgba8unorm',
    height,
    kind: BitmapTextureBackingKind,
    version: 0,
    width,
  });
}
