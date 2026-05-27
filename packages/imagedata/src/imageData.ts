import type { ImageData } from '@flighthq/types';

export function cloneImageData(source: ImageData): ImageData {
  const data = new Uint8ClampedArray(source.data);
  return { colorSpace: 'srgb', data, width: source.width, height: source.height };
}

export function createImageData(width: number, height: number, color: number = 0): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (color !== 0) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const a = (color >>> 24) & 0xff;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { colorSpace: 'srgb', data, width, height };
}
