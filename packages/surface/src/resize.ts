import { invalidateImageSource } from '@flighthq/assets';
import type { SurfaceRegion, SurfaceResizeMode } from '@flighthq/types';

export interface SurfaceResizeOptions {
  mode?: SurfaceResizeMode;
  /**
   * When true, pre-multiplies alpha before interpolation and unpremultiplies
   * after. This prevents the dark-halo bleed that bilinear and bicubic sampling
   * produce at semi-transparent edges when blending in straight-alpha space.
   */
  premultiplied?: boolean;
}

/**
 * Resamples the `source` region into the `dest` region; `dest`'s dimensions
 * define the target size. Modes:
 *   - `'nearest'`: fast, preserves hard edges (pixel art)
 *   - `'bilinear'` (default): smooth, interpolates four surrounding pixels
 *   - `'bicubic'`: high quality, Catmull-Rom interpolation over 4×4 neighbourhood
 *
 * Set `premultiplied: true` to avoid dark-halo bleed at transparent edges.
 *
 * `dest` must not alias `source` — output pixels read arbitrary source positions.
 */
export function resizeSurface(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  options: SurfaceResizeMode | Readonly<SurfaceResizeOptions> = 'bilinear',
): void {
  const opts: Readonly<SurfaceResizeOptions> = typeof options === 'string' ? { mode: options } : options;
  const mode = opts.mode ?? 'bilinear';
  const premultiplied = opts.premultiplied ?? false;

  const sw = source.width;
  const sh = source.height;
  const dw = dest.width;
  const dh = dest.height;
  if (sw === 0 || sh === 0 || dw === 0 || dh === 0) return;
  const sd = source.surface.data;
  const dd = dest.surface.data;
  const sStride = source.surface.width;
  const dStride = dest.surface.width;

  if (mode === 'nearest') {
    for (let dy = 0; dy < dh; dy++) {
      const oy = dest.y + dy;
      if (oy < 0 || oy >= dest.surface.height) continue;
      const sy = source.y + Math.min(sh - 1, Math.floor((dy * sh) / dh));
      if (sy < 0 || sy >= source.surface.height) continue;
      for (let dx = 0; dx < dw; dx++) {
        const ox = dest.x + dx;
        if (ox < 0 || ox >= dStride) continue;
        const sx = source.x + Math.min(sw - 1, Math.floor((dx * sw) / dw));
        if (sx < 0 || sx >= sStride) continue;
        const si = (sy * sStride + sx) * 4;
        const di = (oy * dStride + ox) * 4;
        dd[di] = sd[si];
        dd[di + 1] = sd[si + 1];
        dd[di + 2] = sd[si + 2];
        dd[di + 3] = sd[si + 3];
      }
    }
    return;
  }

  const scaleX = sw / dw;
  const scaleY = sh / dh;

  if (mode === 'bicubic') {
    for (let dy = 0; dy < dh; dy++) {
      const oy = dest.y + dy;
      if (oy < 0 || oy >= dest.surface.height) continue;
      const fy = (dy + 0.5) * scaleY - 0.5;
      const y1 = Math.floor(fy);
      const ty = fy - y1;
      for (let dx = 0; dx < dw; dx++) {
        const ox = dest.x + dx;
        if (ox < 0 || ox >= dStride) continue;
        const fx = (dx + 0.5) * scaleX - 0.5;
        const x1 = Math.floor(fx);
        const tx = fx - x1;
        const di = (oy * dStride + ox) * 4;
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let m = -1; m <= 2; m++) {
            const wy = catmullRomWeight(ty - m);
            const sy = source.y + Math.max(0, Math.min(sh - 1, y1 + m));
            for (let n = -1; n <= 2; n++) {
              const wx = catmullRomWeight(tx - n);
              const sx = source.x + Math.max(0, Math.min(sw - 1, x1 + n));
              const si = (sy * sStride + sx) * 4;
              const v = premultiplied && c < 3 ? (sd[si + c] * sd[si + 3]) / 255 : sd[si + c];
              sum += v * wy * wx;
            }
          }
          if (premultiplied && c < 3) {
            // defer unpremultiply until alpha is written
            dd[di + c] = Math.max(0, Math.min(255, Math.round(sum)));
          } else {
            dd[di + c] = Math.max(0, Math.min(255, Math.round(sum)));
          }
        }
        if (premultiplied) {
          const a = dd[di + 3];
          if (a > 0) {
            dd[di] = Math.min(255, Math.round((dd[di] * 255) / a));
            dd[di + 1] = Math.min(255, Math.round((dd[di + 1] * 255) / a));
            dd[di + 2] = Math.min(255, Math.round((dd[di + 2] * 255) / a));
          } else {
            dd[di] = 0;
            dd[di + 1] = 0;
            dd[di + 2] = 0;
          }
        }
      }
    }
    return;
  }

  // bilinear
  for (let dy = 0; dy < dh; dy++) {
    const oy = dest.y + dy;
    if (oy < 0 || oy >= dest.surface.height) continue;
    const fy = (dy + 0.5) * scaleY - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const y0c = source.y + Math.max(0, Math.min(sh - 1, y0));
    const y1c = source.y + Math.max(0, Math.min(sh - 1, y0 + 1));
    for (let dx = 0; dx < dw; dx++) {
      const ox = dest.x + dx;
      if (ox < 0 || ox >= dStride) continue;
      const fx = (dx + 0.5) * scaleX - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const x0c = source.x + Math.max(0, Math.min(sw - 1, x0));
      const x1c = source.x + Math.max(0, Math.min(sw - 1, x0 + 1));
      const i00 = (y0c * sStride + x0c) * 4;
      const i10 = (y0c * sStride + x1c) * 4;
      const i01 = (y1c * sStride + x0c) * 4;
      const i11 = (y1c * sStride + x1c) * 4;
      const di = (oy * dStride + ox) * 4;
      for (let c = 0; c < 4; c++) {
        let v00 = sd[i00 + c];
        let v10 = sd[i10 + c];
        let v01 = sd[i01 + c];
        let v11 = sd[i11 + c];
        if (premultiplied && c < 3) {
          v00 = (v00 * sd[i00 + 3]) / 255;
          v10 = (v10 * sd[i10 + 3]) / 255;
          v01 = (v01 * sd[i01 + 3]) / 255;
          v11 = (v11 * sd[i11 + 3]) / 255;
        }
        const top = v00 * (1 - tx) + v10 * tx;
        const bottom = v01 * (1 - tx) + v11 * tx;
        dd[di + c] = Math.round(top * (1 - ty) + bottom * ty);
      }
      if (premultiplied) {
        const a = dd[di + 3];
        if (a > 0) {
          dd[di] = Math.min(255, Math.round((dd[di] * 255) / a));
          dd[di + 1] = Math.min(255, Math.round((dd[di + 1] * 255) / a));
          dd[di + 2] = Math.min(255, Math.round((dd[di + 2] * 255) / a));
        } else {
          dd[di] = 0;
          dd[di + 1] = 0;
          dd[di + 2] = 0;
        }
      }
    }
  }
  invalidateImageSource(dest.surface);
}

// Catmull-Rom weight for distance t (|t| in [0, 2]).
function catmullRomWeight(t: number): number {
  const a = Math.abs(t);
  if (a >= 2) return 0;
  if (a >= 1) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 1.5 * a * a * a - 2.5 * a * a + 1;
}
