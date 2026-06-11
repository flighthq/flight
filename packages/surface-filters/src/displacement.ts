import type { SurfaceRegion } from '@flighthq/types';

export type SurfaceDisplacementMapMode = 'clamp' | 'color' | 'ignore' | 'wrap';

export interface SurfaceDisplacementMapFilterOptions {
  /** Map surface whose channels drive the per-pixel displacement. */
  map: Readonly<SurfaceRegion>;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives X displacement. Default 0. */
  componentX?: number;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives Y displacement. Default 1. */
  componentY?: number;
  /** X displacement scale. A map value of 128 is neutral (no shift). Default 0. */
  scaleX?: number;
  /** Y displacement scale. Default 0. */
  scaleY?: number;
  /** How to handle sample positions that fall outside the source region. Default 'wrap'. */
  mode?: SurfaceDisplacementMapMode;
  /** Packed RGB fill used when `mode` is 'color'. Default 0. */
  color?: number;
  /** Fill alpha (0..1) used when `mode` is 'color'. Default 0. */
  alpha?: number;
}

/**
 * Warps `source` by sampling each output pixel from a displaced source position,
 * writing into `out`. The displacement for pixel (px, py) is read from `map` at
 * the aligned position and scaled:
 *
 *   dx = ((mapValueX - 128) * scaleX) / 256
 *   dy = ((mapValueY - 128) * scaleY) / 256
 *
 * Sampling is nearest-neighbor (the displaced position is rounded). `mode`
 * controls sample positions outside the source region: 'wrap' tiles, 'clamp'
 * holds the edge, 'ignore' leaves the undisplaced source pixel, and 'color'
 * fills with `color`/`alpha`.
 *
 * `out` must be at least `source.width * source.height * 4` bytes and must NOT
 * alias `source.surface.data` — output pixels read arbitrary source positions.
 */
export function applySurfaceDisplacementMapFilter(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceDisplacementMapFilterOptions>,
): void {
  const w = source.width;
  const h = source.height;
  const map = options.map;
  const componentX = options.componentX ?? 0;
  const componentY = options.componentY ?? 1;
  const scaleX = options.scaleX ?? 0;
  const scaleY = options.scaleY ?? 0;
  const mode = options.mode ?? 'wrap';
  const color = options.color ?? 0;
  const fillR = (color >> 16) & 0xff;
  const fillG = (color >> 8) & 0xff;
  const fillB = color & 0xff;
  const fillA = Math.round(Math.max(0, Math.min(1, options.alpha ?? 0)) * 255);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const mapVx = sampleMapChannel(map, px, py, componentX);
      const mapVy = sampleMapChannel(map, px, py, componentY);
      let sampleX = px + Math.round(((mapVx - 128) * scaleX) / 256);
      let sampleY = py + Math.round(((mapVy - 128) * scaleY) / 256);

      if (sampleX < 0 || sampleX >= w || sampleY < 0 || sampleY >= h) {
        if (mode === 'wrap') {
          sampleX = ((sampleX % w) + w) % w;
          sampleY = ((sampleY % h) + h) % h;
        } else if (mode === 'clamp') {
          sampleX = Math.max(0, Math.min(w - 1, sampleX));
          sampleY = Math.max(0, Math.min(h - 1, sampleY));
        } else if (mode === 'ignore') {
          sampleX = px;
          sampleY = py;
        } else {
          out[di] = fillR;
          out[di + 1] = fillG;
          out[di + 2] = fillB;
          out[di + 3] = fillA;
          continue;
        }
      }

      const sx = source.x + sampleX;
      const sy = source.y + sampleY;
      if (sx < 0 || sx >= source.surface.width || sy < 0 || sy >= source.surface.height) {
        out[di] = 0;
        out[di + 1] = 0;
        out[di + 2] = 0;
        out[di + 3] = 0;
        continue;
      }
      const si = (sy * source.surface.width + sx) * 4;
      out[di] = source.surface.data[si];
      out[di + 1] = source.surface.data[si + 1];
      out[di + 2] = source.surface.data[si + 2];
      out[di + 3] = source.surface.data[si + 3];
    }
  }
}

// A map sample outside the map's bounds is neutral (128) — no displacement.
function sampleMapChannel(map: Readonly<SurfaceRegion>, px: number, py: number, component: number): number {
  const mx = map.x + px;
  const my = map.y + py;
  if (mx < 0 || mx >= map.surface.width || my < 0 || my >= map.surface.height) return 128;
  return map.surface.data[(my * map.surface.width + mx) * 4 + component];
}
