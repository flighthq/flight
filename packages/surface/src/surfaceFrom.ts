import { createEntity } from '@flighthq/entity';
import { createImageResourceFromCanvas } from '@flighthq/image';
import type { ImageResource, Surface } from '@flighthq/types';

export function createImageResourceFromSurface(surface: Readonly<Surface>): ImageResource {
  const canvas = document.createElement('canvas');
  canvas.width = surface.width;
  canvas.height = surface.height;
  const domImageData = new globalThis.ImageData(surface.width, surface.height);
  domImageData.data.set(surface.data);
  canvas.getContext('2d')!.putImageData(domImageData, 0, 0);
  return createImageResourceFromCanvas(canvas);
}

export function createSurfaceFromCanvas(
  canvas: HTMLCanvasElement,
  x: number = 0,
  y: number = 0,
  width?: number,
  height?: number,
): Surface {
  const w = width ?? canvas.width;
  const h = height ?? canvas.height;
  const ctx = canvas.getContext('2d')!;
  const raw = ctx.getImageData(x, y, w, h);
  return createEntity({
    alphaType: 'straight',
    colorSpace: raw.colorSpace as 'srgb' | 'display-p3',
    compressed: null,
    data: raw.data,
    format: 'rgba8unorm',
    height: raw.height,
    source: null,
    version: 0,
    width: raw.width,
  });
}

export function createSurfaceFromImageResource(resource: Readonly<ImageResource>): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = resource.width;
  canvas.height = resource.height;
  if (resource.source === null) {
    // Data-only resource: copy its existing pixels when present, otherwise allocate a transparent buffer.
    return createEntity({
      alphaType: resource.alphaType,
      colorSpace: 'srgb' as const,
      compressed: null,
      data:
        resource.data !== null
          ? new Uint8ClampedArray(resource.data)
          : new Uint8ClampedArray(resource.width * resource.height * 4),
      format: resource.format,
      height: resource.height,
      source: null,
      version: 0,
      width: resource.width,
    });
  }
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(resource.source, 0, 0);
  const raw = ctx.getImageData(0, 0, resource.width, resource.height);
  return createEntity({
    alphaType: 'straight',
    colorSpace: raw.colorSpace as 'srgb' | 'display-p3',
    compressed: null,
    data: raw.data,
    format: 'rgba8unorm',
    height: resource.height,
    source: null,
    version: 0,
    width: resource.width,
  });
}

/**
 * Reads a surface out of any `CanvasImageSource` by drawing it into a scratch 2D canvas. Unlike
 * createSurfaceFromCanvas — which calls getContext('2d') and so only works on a 2D-rendered canvas —
 * this captures a Gl or Wgpu canvas too, giving one readback path for every render backend.
 * `width`/`height` are the device-pixel dimensions to capture (pass the render state's canvas size).
 * For a Gl/Wgpu source, draw before the browser composites the frame away (in tests, enable the
 * context's preserveDrawingBuffer, or read immediately after rendering).
 */
export function createSurfaceFromImageSource(source: CanvasImageSource, width: number, height: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  const raw = ctx.getImageData(0, 0, width, height);
  return createEntity({
    alphaType: 'straight',
    colorSpace: raw.colorSpace as 'srgb' | 'display-p3',
    compressed: null,
    data: raw.data,
    format: 'rgba8unorm',
    height,
    source: null,
    version: 0,
    width,
  });
}
