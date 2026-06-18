import { createEntity } from '@flighthq/entity';
import { createImageResourceFromCanvas } from '@flighthq/resources';
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
    colorSpace: raw.colorSpace as 'srgb' | 'display-p3',
    data: raw.data,
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
    return createEntity({
      colorSpace: 'srgb' as const,
      data: new Uint8ClampedArray(resource.width * resource.height * 4),
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
    colorSpace: raw.colorSpace as 'srgb' | 'display-p3',
    data: raw.data,
    height: resource.height,
    source: null,
    version: 0,
    width: resource.width,
  });
}
