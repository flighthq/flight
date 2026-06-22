import type { SurfaceRegion } from '@flighthq/types';

export type SurfaceDisplacementMapMode = 'clamp' | 'color' | 'ignore' | 'wrap';

export interface SurfaceDisplacementMapOptions {
  /** Map surface whose channels drive the per-pixel displacement. */
  map: Readonly<SurfaceRegion>;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives X displacement. Default 0. */
  componentX?: number;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives Y displacement. Default 1. */
  componentY?: number;
  /**
   * X displacement scale in pixels. A map value of 128 produces no shift; 0
   * shifts by -0.5 × scaleX; 255 shifts by +0.5 × scaleX. Default 0.
   */
  scaleX?: number;
  /** Y displacement scale in pixels. Default 0. */
  scaleY?: number;
  /** How to handle sample positions that fall outside the source region. Default 'wrap'. */
  mode?: SurfaceDisplacementMapMode;
  /** Packed 0xRRGGBBAA fill used when `mode` is 'color'. Default 0. */
  fillColor?: number;
}

/**
 * Warps `source` by sampling each output pixel from a displaced source position,
 * writing into `out`. The displacement for pixel (px, py) is read from `map` at
 * the aligned position and scaled:
 *
 *   dx = (mapValueX / 255 - 0.5) * scaleX
 *   dy = (mapValueY / 255 - 0.5) * scaleY
 *
 * A map value of 128 is approximately neutral (< 0.2px shift). Sampling uses
 * bilinear interpolation. `mode` controls sample positions outside the source
 * region: 'wrap' tiles, 'clamp' holds the edge, 'ignore' leaves the undisplaced
 * source pixel, and 'color' fills with `fillColor`.
 *
 * `out` must be at least `source.width * source.height * 4` bytes and must NOT
 * alias `source.surface.data` — output pixels read arbitrary source positions.
 */
export function displaceSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceDisplacementMapOptions>,
): void {
  const w = source.width;
  const h = source.height;
  const map = options.map;
  const componentX = options.componentX ?? 0;
  const componentY = options.componentY ?? 1;
  const scaleX = options.scaleX ?? 0;
  const scaleY = options.scaleY ?? 0;
  const mode = options.mode ?? 'wrap';
  const fillColor = options.fillColor ?? 0;
  const fillR = (fillColor >>> 24) & 0xff;
  const fillG = (fillColor >> 16) & 0xff;
  const fillB = (fillColor >> 8) & 0xff;
  const fillA = fillColor & 0xff;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const mapVx = sampleMapChannel(map, px, py, componentX);
      const mapVy = sampleMapChannel(map, px, py, componentY);
      // Symmetric: value 0 → -0.5×scale, value 128 ≈ 0, value 255 → +0.5×scale
      const rawSampleX = px + (mapVx / 255 - 0.5) * scaleX;
      const rawSampleY = py + (mapVy / 255 - 0.5) * scaleY;

      let sampleX = rawSampleX;
      let sampleY = rawSampleY;

      if (rawSampleX < 0 || rawSampleX >= w || rawSampleY < 0 || rawSampleY >= h) {
        if (mode === 'wrap') {
          sampleX = ((rawSampleX % w) + w) % w;
          sampleY = ((rawSampleY % h) + h) % h;
        } else if (mode === 'clamp') {
          sampleX = Math.max(0, Math.min(w - 1, rawSampleX));
          sampleY = Math.max(0, Math.min(h - 1, rawSampleY));
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

      // Bilinear sample from source at (sampleX, sampleY).
      const x0 = Math.floor(sampleX);
      const y0 = Math.floor(sampleY);
      const tx = sampleX - x0;
      const ty = sampleY - y0;
      const sStride = source.surface.width;
      const sData = source.surface.data;
      const x0c = source.x + Math.max(0, Math.min(w - 1, x0));
      const x1c = source.x + Math.max(0, Math.min(w - 1, x0 + 1));
      const y0c = source.y + Math.max(0, Math.min(h - 1, y0));
      const y1c = source.y + Math.max(0, Math.min(h - 1, y0 + 1));

      if (x0c < 0 || x0c >= sData.length / 4 || y0c < 0) {
        out[di] = 0;
        out[di + 1] = 0;
        out[di + 2] = 0;
        out[di + 3] = 0;
        continue;
      }

      const i00 = (y0c * sStride + x0c) * 4;
      const i10 = (y0c * sStride + x1c) * 4;
      const i01 = (y1c * sStride + x0c) * 4;
      const i11 = (y1c * sStride + x1c) * 4;
      for (let c = 0; c < 4; c++) {
        const top = sData[i00 + c] * (1 - tx) + sData[i10 + c] * tx;
        const bottom = sData[i01 + c] * (1 - tx) + sData[i11 + c] * tx;
        out[di + c] = Math.round(top * (1 - ty) + bottom * ty);
      }
    }
  }
}

// A map sample outside the map's bounds returns 128 (neutral — no displacement).
function sampleMapChannel(map: Readonly<SurfaceRegion>, px: number, py: number, component: number): number {
  const mx = map.x + px;
  const my = map.y + py;
  if (mx < 0 || mx >= map.surface.width || my < 0 || my >= map.surface.height) return 128;
  return map.surface.data[(my * map.surface.width + mx) * 4 + component];
}
