import type { PixelOrder } from '@flighthq/types';

/**
 * Converts a packed pixel buffer from one channel order to another.
 * Safe to pass the same buffer as both `out` and `source` — all four
 * channels are read into locals before any write.
 */
export function convertSurfacePixelOrder(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  length: number,
  from: PixelOrder,
  to: PixelOrder,
): void {
  if (from === to) {
    if (out !== source) out.set(source.subarray(0, length));
    return;
  }
  const [srcR, srcG, srcB, srcA] = channelOffsets(from);
  const [dstR, dstG, dstB, dstA] = channelOffsets(to);
  for (let i = 0; i < length; i += 4) {
    const r = source[i + srcR];
    const g = source[i + srcG];
    const b = source[i + srcB];
    const a = source[i + srcA];
    out[i + dstR] = r;
    out[i + dstG] = g;
    out[i + dstB] = b;
    out[i + dstA] = a;
  }
}

/**
 * Converts straight-alpha pixels to premultiplied alpha in place or into
 * a separate buffer. RGB channels are multiplied by alpha/255.
 * Safe to pass the same buffer as both `out` and `source`.
 */
export function premultiplySurfacePixels(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  length: number,
): void {
  for (let i = 0; i < length; i += 4) {
    const a = source[i + 3] / 255;
    out[i] = Math.round(source[i] * a);
    out[i + 1] = Math.round(source[i + 1] * a);
    out[i + 2] = Math.round(source[i + 2] * a);
    out[i + 3] = source[i + 3];
  }
}

/**
 * Converts premultiplied-alpha pixels back to straight alpha in place or
 * into a separate buffer. Pixels with alpha=0 are written as (0,0,0,0).
 * Safe to pass the same buffer as both `out` and `source`.
 */
export function unpremultiplySurfacePixels(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  length: number,
): void {
  for (let i = 0; i < length; i += 4) {
    const a = source[i + 3];
    if (a === 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    } else {
      const inv = 255 / a;
      out[i] = Math.min(255, Math.round(source[i] * inv));
      out[i + 1] = Math.min(255, Math.round(source[i + 1] * inv));
      out[i + 2] = Math.min(255, Math.round(source[i + 2] * inv));
      out[i + 3] = a;
    }
  }
}

function channelOffsets(order: PixelOrder): [number, number, number, number] {
  switch (order) {
    case 'RGBA':
      return [0, 1, 2, 3];
    case 'BGRA':
      return [2, 1, 0, 3];
    case 'ARGB':
      return [1, 2, 3, 0];
    case 'ABGR':
      return [3, 2, 1, 0];
  }
}
