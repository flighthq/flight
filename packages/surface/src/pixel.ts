import type { Surface } from '@flighthq/types';

export function getSurfacePixel(source: Readonly<Surface>, x: number, y: number): number {
  const i = (y * source.width + x) * 4;
  return ((source.data[i] << 16) | (source.data[i + 1] << 8) | source.data[i + 2]) >>> 0;
}

export function getSurfacePixel32(source: Readonly<Surface>, x: number, y: number): number {
  const i = (y * source.width + x) * 4;
  return ((source.data[i] << 24) | (source.data[i + 1] << 16) | (source.data[i + 2] << 8) | source.data[i + 3]) >>> 0;
}

export function setSurfacePixel(out: Surface, x: number, y: number, color: number): void {
  const i = (y * out.width + x) * 4;
  out.data[i] = (color >> 16) & 0xff;
  out.data[i + 1] = (color >> 8) & 0xff;
  out.data[i + 2] = color & 0xff;
}

export function setSurfacePixel32(out: Surface, x: number, y: number, color: number): void {
  const i = (y * out.width + x) * 4;
  out.data[i] = (color >>> 24) & 0xff;
  out.data[i + 1] = (color >> 16) & 0xff;
  out.data[i + 2] = (color >> 8) & 0xff;
  out.data[i + 3] = color & 0xff;
}
