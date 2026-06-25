import { invalidateImageResource } from '@flighthq/image';
import type { SurfaceRegion } from '@flighthq/types';

/**
 * Applies a 256-entry per-channel lookup table (LUT) to `out`. The LUT maps
 * each channel's input value (0–255) to an output value (0–255). To apply
 * a single curve to all RGB channels, pass the same array for R, G, and B.
 * To leave a channel unchanged, pass `null`; that channel is copied unchanged.
 *
 * All non-null LUT arrays must have exactly 256 entries. The alpha channel
 * is never remapped unless `alpha` is provided.
 *
 * `out` and `source` may alias the same region — each pixel is read before
 * it is written.
 */
export function applySurfaceCurve(
  out: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  redLut: Readonly<Uint8Array | Uint8ClampedArray | null>,
  greenLut: Readonly<Uint8Array | Uint8ClampedArray | null>,
  blueLut: Readonly<Uint8Array | Uint8ClampedArray | null>,
  alphaLut: Readonly<Uint8Array | Uint8ClampedArray | null> = null,
): void {
  const w = Math.min(out.width, source.width);
  const h = Math.min(out.height, source.height);
  const od = out.surface.data;
  const sd = source.surface.data;
  for (let py = 0; py < h; py++) {
    const sy = source.y + py;
    const oy = out.y + py;
    if (sy < 0 || sy >= source.surface.height || oy < 0 || oy >= out.surface.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + px;
      const ox = out.x + px;
      if (sx < 0 || sx >= source.surface.width || ox < 0 || ox >= out.surface.width) continue;
      const si = (sy * source.surface.width + sx) * 4;
      const oi = (oy * out.surface.width + ox) * 4;
      // Read inputs before writing (alias-safe).
      const r = sd[si];
      const g = sd[si + 1];
      const b = sd[si + 2];
      const a = sd[si + 3];
      od[oi] = redLut !== null ? redLut[r] : r;
      od[oi + 1] = greenLut !== null ? greenLut[g] : g;
      od[oi + 2] = blueLut !== null ? blueLut[b] : b;
      od[oi + 3] = alphaLut !== null ? alphaLut[a] : a;
    }
  }
  invalidateImageResource(out.surface);
}

/**
 * Applies a levels adjustment to `out`, stretching pixel values from the input
 * range `[blackPoint, whitePoint]` to the full 0–255 output range, with a
 * mid-tone `gamma` correction applied before the output stretch.
 *
 * - `blackPoint` (default 0): input value that maps to 0 (blacks point).
 * - `whitePoint` (default 255): input value that maps to 255 (whites point).
 * - `gamma` (default 1): exponent for the midtone curve. Values < 1 lighten
 *   midtones; values > 1 darken them.
 *
 * Alpha channel is passed through unchanged. `out` and `source` may alias.
 */
export function applySurfaceLevels(
  out: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  blackPoint: number = 0,
  whitePoint: number = 255,
  gamma: number = 1,
): void {
  const bp = Math.max(0, Math.min(254, blackPoint));
  const wp = Math.max(bp + 1, Math.min(255, whitePoint));
  const span = wp - bp;
  const invGamma = gamma > 0 ? 1 / gamma : 1;
  // Build a 256-entry LUT so the pixel loop is a fast table lookup.
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const normalized = Math.max(0, Math.min(1, (i - bp) / span));
    lut[i] = Math.round(Math.pow(normalized, invGamma) * 255);
  }
  applySurfaceCurve(out, source, lut, lut, lut, null);
}
