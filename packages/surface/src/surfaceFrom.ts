import { createEntity } from '@flighthq/foundation';
import { createImageSourceFromCanvas } from '@flighthq/assets';
import type { ImageSource, Surface } from '@flighthq/types';

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
    src: null,
    version: 0,
    width: raw.width,
  });
}

export function createSurfaceFromImageSource(source: ImageSource): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  if (source.src === null) {
    return createEntity({
      colorSpace: 'srgb' as const,
      data: new Uint8ClampedArray(source.width * source.height * 4),
      height: source.height,
      src: null,
      version: 0,
      width: source.width,
    });
  }
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source.src, 0, 0);
  const raw = ctx.getImageData(0, 0, source.width, source.height);
  return createEntity({
    colorSpace: raw.colorSpace as 'srgb' | 'display-p3',
    data: raw.data,
    height: source.height,
    src: null,
    version: 0,
    width: source.width,
  });
}

export function createImageSourceFromSurface(source: Surface): ImageSource {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const domImageData = new globalThis.ImageData(source.width, source.height);
  domImageData.data.set(source.data);
  canvas.getContext('2d')!.putImageData(domImageData, 0, 0);
  return createImageSourceFromCanvas(canvas);
}
