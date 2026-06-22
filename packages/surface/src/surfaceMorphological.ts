import type { SurfaceRegion } from '@flighthq/types';

/**
 * Applies morphological dilation to `source`, writing into `out`. Each output
 * channel is the maximum of that channel over the `(2 * radius + 1)²`
 * neighbourhood; all four channels (RGBA) are dilated independently.
 *
 * Dilation expands bright regions and thickens shapes. It is the dual of
 * `erodeSurface` — applying erosion then dilation gives a morphological opening,
 * the reverse gives a closing.
 *
 * `out` must be at least `source.width * source.height * 4` bytes and must NOT
 * alias `source.surface.data` — each output pixel reads a neighbourhood of
 * source pixels.
 */
export function dilateSurface(out: Uint8ClampedArray, source: Readonly<SurfaceRegion>, radius: number): void {
  applyMorphological(out, source, radius, true);
}

/**
 * Applies morphological erosion to `source`, writing into `out`. Each output
 * channel is the minimum of that channel over the `(2 * radius + 1)²`
 * neighbourhood; all four channels (RGBA) are eroded independently.
 *
 * Erosion shrinks bright regions and thins shapes. It is the dual of
 * `dilateSurface`.
 *
 * `out` must be at least `source.width * source.height * 4` bytes and must NOT
 * alias `source.surface.data` — each output pixel reads a neighbourhood of
 * source pixels.
 */
export function erodeSurface(out: Uint8ClampedArray, source: Readonly<SurfaceRegion>, radius: number): void {
  applyMorphological(out, source, radius, false);
}

function applyMorphological(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  radius: number,
  dilate: boolean,
): void {
  const r = Math.max(0, Math.round(radius));
  const w = source.width;
  const h = source.height;
  const surfaceWidth = source.surface.width;
  const surfaceHeight = source.surface.height;
  const data = source.surface.data;
  const identity = dilate ? 0 : 255;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let vR = identity;
      let vG = identity;
      let vB = identity;
      let vA = identity;
      for (let ky = -r; ky <= r; ky++) {
        const sy = Math.max(0, Math.min(surfaceHeight - 1, source.y + py + ky));
        for (let kx = -r; kx <= r; kx++) {
          const sx = Math.max(0, Math.min(surfaceWidth - 1, source.x + px + kx));
          const si = (sy * surfaceWidth + sx) * 4;
          if (dilate) {
            if (data[si] > vR) vR = data[si];
            if (data[si + 1] > vG) vG = data[si + 1];
            if (data[si + 2] > vB) vB = data[si + 2];
            if (data[si + 3] > vA) vA = data[si + 3];
          } else {
            if (data[si] < vR) vR = data[si];
            if (data[si + 1] < vG) vG = data[si + 1];
            if (data[si + 2] < vB) vB = data[si + 2];
            if (data[si + 3] < vA) vA = data[si + 3];
          }
        }
      }
      const di = (py * w + px) * 4;
      out[di] = vR;
      out[di + 1] = vG;
      out[di + 2] = vB;
      out[di + 3] = vA;
    }
  }
}
