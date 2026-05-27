import type { Surface } from '@flighthq/types';

export function getPixel(source: Surface, x: number, y: number): number {
  const i = (y * source.width + x) * 4;
  return ((source.data[i] << 16) | (source.data[i + 1] << 8) | source.data[i + 2]) >>> 0;
}

export function getPixel32(source: Surface, x: number, y: number): number {
  const i = (y * source.width + x) * 4;
  return ((source.data[i + 3] << 24) | (source.data[i] << 16) | (source.data[i + 1] << 8) | source.data[i + 2]) >>> 0;
}

export function getPixels(
  out: Uint8ClampedArray,
  source: Surface,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const si = ((y + py) * source.width + (x + px)) * 4;
      const di = (py * width + px) * 4;
      out[di] = source.data[si];
      out[di + 1] = source.data[si + 1];
      out[di + 2] = source.data[si + 2];
      out[di + 3] = source.data[si + 3];
    }
  }
}

export function setPixel(dest: Surface, x: number, y: number, color: number): void {
  const i = (y * dest.width + x) * 4;
  dest.data[i] = (color >> 16) & 0xff;
  dest.data[i + 1] = (color >> 8) & 0xff;
  dest.data[i + 2] = color & 0xff;
}

export function setPixel32(dest: Surface, x: number, y: number, color: number): void {
  const i = (y * dest.width + x) * 4;
  dest.data[i] = (color >> 16) & 0xff;
  dest.data[i + 1] = (color >> 8) & 0xff;
  dest.data[i + 2] = color & 0xff;
  dest.data[i + 3] = (color >>> 24) & 0xff;
}

export function setPixels(
  dest: Surface,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Uint8ClampedArray,
): void {
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const si = (py * width + px) * 4;
      const di = ((y + py) * dest.width + (x + px)) * 4;
      dest.data[di] = data[si];
      dest.data[di + 1] = data[si + 1];
      dest.data[di + 2] = data[si + 2];
      dest.data[di + 3] = data[si + 3];
    }
  }
}
