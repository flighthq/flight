import { createEntity } from '@flighthq/entity/contract';
import type { ImageResource, Bitmap } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { resolveBitmapReadback } from './bitmapReadbackResolver';

/**
 * Reads a host-backed ImageResource into a newly allocated, CPU-readable Bitmap. Returns `null` when the
 * readback cannot complete — call `explainBitmapReadback` with `(resource.source, resource.width,
 * resource.height)` for the reason.
 */
export function captureBitmapFromImageResource(resource: Readonly<ImageResource>): Bitmap | null {
  return createBitmapFromImageSource(resource.source, resource.width, resource.height);
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
    gamut: raw.colorSpace as 'srgb' | 'display-p3',
    data: raw.data,
    format: 'rgba8unorm',
    height: raw.height,
    kind: BitmapTextureSourceKind,
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
 *
 * Returns `null` for the expected failures named by `explainBitmapReadback`. Faults during a selected
 * backend's full read or Bitmap allocation propagate instead of being mislabeled as source refusal.
 */
export function createBitmapFromImageSource(source: CanvasImageSource, width: number, height: number): Bitmap | null {
  return resolveBitmapReadback(source, width, height, 'bitmap').bitmap;
}
