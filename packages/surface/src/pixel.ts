import type { Surface } from '@flighthq/types';

export function getSurfacePixel(source: Surface, x: number, y: number): number {
  const i = (y * source.width + x) * 4;
  return ((source.data[i] << 16) | (source.data[i + 1] << 8) | source.data[i + 2]) >>> 0;
}

export function getSurfacePixel32(source: Surface, x: number, y: number): number {
  const i = (y * source.width + x) * 4;
  return ((source.data[i + 3] << 24) | (source.data[i] << 16) | (source.data[i + 1] << 8) | source.data[i + 2]) >>> 0;
}

export function getSurfacePixels(
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

export function setSurfacePixel(out: Surface, x: number, y: number, color: number): void {
  const i = (y * out.width + x) * 4;
  out.data[i] = (color >> 16) & 0xff;
  out.data[i + 1] = (color >> 8) & 0xff;
  out.data[i + 2] = color & 0xff;
}

export function setSurfacePixel32(out: Surface, x: number, y: number, color: number): void {
  const i = (y * out.width + x) * 4;
  out.data[i] = (color >> 16) & 0xff;
  out.data[i + 1] = (color >> 8) & 0xff;
  out.data[i + 2] = color & 0xff;
  out.data[i + 3] = (color >>> 24) & 0xff;
}

export function setSurfacePixels(
  out: Surface,
  x: number,
  y: number,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): void {
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const si = (py * width + px) * 4;
      const di = ((y + py) * out.width + (x + px)) * 4;
      out.data[di] = pixels[si];
      out.data[di + 1] = pixels[si + 1];
      out.data[di + 2] = pixels[si + 2];
      out.data[di + 3] = pixels[si + 3];
    }
  }
}
