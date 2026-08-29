import { createEntity } from '@flighthq/entity/contract';
import type { Image, Bitmap } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

/**
 * Reads a host-backed Image into a newly allocated, CPU-readable Bitmap. Returns `null` when the
 * readback cannot complete — call `explainBitmapReadback` with `(resource.source, resource.width,
 * resource.height)` for the reason.
 */
export function captureBitmapFromImageResource(resource: Readonly<Image>): Bitmap | null {
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
 * Returns `null` when the pixels cannot be read rather than letting a platform exception escape. A
 * cross-origin source taints the scratch canvas and the platform refuses to return its pixels — that
 * is an expected outcome of loading someone else's image, not a programmer error, so it takes the
 * sentinel the diagnostics conventions reserve for expected failure. Call `explainBitmapReadback`
 * with the same arguments for the reason; it re-derives it without allocating a bitmap.
 */
export function createBitmapFromImageSource(source: CanvasImageSource, width: number, height: number): Bitmap | null {
  if (width <= 0 || height <= 0) return null;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  let raw: ImageData;
  try {
    ctx.drawImage(source, 0, 0);
    raw = ctx.getImageData(0, 0, width, height);
  } catch {
    // A tainted canvas throws SecurityError from getImageData; a source the platform cannot draw
    // throws from drawImage. Both mean "no pixels for you", which is the sentinel's job to say.
    return null;
  }
  // Annotated rather than returned inline: with a `Bitmap | null` return the object literal loses the
  // contextual typing that narrows its string fields to Bitmap's literal types.
  const bitmap: Bitmap = createEntity({
    alphaType: 'straight',
    gamut: raw.colorSpace as 'srgb' | 'display-p3',
    data: raw.data,
    format: 'rgba8unorm',
    height,
    kind: BitmapTextureSourceKind,
    version: 0,
    width,
  });
  return bitmap;
}
