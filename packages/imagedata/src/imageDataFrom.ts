import { createImageSourceFromCanvas } from '@flighthq/assets';
import type { ImageSource } from '@flighthq/types';

export function createImageDataFromCanvas(
  canvas: HTMLCanvasElement,
  x: number = 0,
  y: number = 0,
  width?: number,
  height?: number,
): ImageData {
  const w = width ?? canvas.width;
  const h = height ?? canvas.height;
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(x, y, w, h);
}

export function createImageDataFromImageSource(source: ImageSource): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  if (source.src === null) return new ImageData(source.width, source.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source.src, 0, 0);
  return ctx.getImageData(0, 0, source.width, source.height);
}

export function createImageSourceFromImageData(source: ImageData): ImageSource {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d')!.putImageData(source, 0, 0);
  return createImageSourceFromCanvas(canvas);
}
