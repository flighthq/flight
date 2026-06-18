import { invalidateImageResource } from '@flighthq/resources';
import type { Surface } from '@flighthq/types';

import type { ImageChannel } from './imageChannel';

// W3C luma coefficients for perceptual luminance (same as CSS saturate/grayscale).
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export function getSurfacePixel(source: Readonly<Surface>, x: number, y: number): number {
  const i = (y * source.width + x) * 4;
  return ((source.data[i] << 24) | (source.data[i + 1] << 16) | (source.data[i + 2] << 8) | source.data[i + 3]) >>> 0;
}

export function getSurfacePixelChannel(source: Readonly<Surface>, x: number, y: number, channel: ImageChannel): number {
  return source.data[(y * source.width + x) * 4 + channel];
}

export function getSurfacePixelLuminance(source: Readonly<Surface>, x: number, y: number): number {
  const i = (y * source.width + x) * 4;
  return Math.round(source.data[i] * LUMA_R + source.data[i + 1] * LUMA_G + source.data[i + 2] * LUMA_B);
}

export function getSurfacePixelRGB(source: Readonly<Surface>, x: number, y: number): number {
  const i = (y * source.width + x) * 4;
  return ((source.data[i] << 16) | (source.data[i + 1] << 8) | source.data[i + 2]) >>> 0;
}

export function setSurfacePixel(out: Surface, x: number, y: number, color: number): void {
  const i = (y * out.width + x) * 4;
  out.data[i] = (color >>> 24) & 0xff;
  out.data[i + 1] = (color >> 16) & 0xff;
  out.data[i + 2] = (color >> 8) & 0xff;
  out.data[i + 3] = color & 0xff;
  invalidateImageResource(out);
}

export function setSurfacePixelRGB(out: Surface, x: number, y: number, color: number): void {
  const i = (y * out.width + x) * 4;
  out.data[i] = (color >> 16) & 0xff;
  out.data[i + 1] = (color >> 8) & 0xff;
  out.data[i + 2] = color & 0xff;
  invalidateImageResource(out);
}
