import { invalidateImageResource } from '@flighthq/image';
import type { SurfaceEdgeMode, SurfaceRegion, SurfaceResizeMode, SurfaceResizeOptions } from '@flighthq/types';

/**
 * Resamples the `source` region into the `dest` region; `dest`'s dimensions
 * define the target size. Modes:
 *   - `'nearest'`: fast, preserves hard edges (pixel art)
 *   - `'bilinear'` (default): smooth, interpolates four surrounding pixels
 *   - `'bicubic'`: high quality, Catmull-Rom interpolation over 4×4 neighbourhood
 *
 * `edgeMode` controls how boundary interpolation handles out-of-bounds
 * coordinates (default `'clamp'`).
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
  const edgeMode = opts.edgeMode ?? 'clamp';
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
            const ry = resolveResizeEdge(y1 + m, sh, edgeMode);
            for (let n = -1; n <= 2; n++) {
              const wx = catmullRomWeight(tx - n);
              const rx = resolveResizeEdge(x1 + n, sw, edgeMode);
              if (rx === null || ry === null) continue;
              const sy = source.y + ry;
              const sx = source.x + rx;
              const si = (sy * sStride + sx) * 4;
              const v = premultiplied && c < 3 ? (sd[si + c] * sd[si + 3]) / 255 : sd[si + c];
              sum += v * wy * wx;
            }
          }
          dd[di + c] = Math.max(0, Math.min(255, Math.round(sum)));
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
    const ry0 = resolveResizeEdge(y0, sh, edgeMode);
    const ry1 = resolveResizeEdge(y0 + 1, sh, edgeMode);
    for (let dx = 0; dx < dw; dx++) {
      const ox = dest.x + dx;
      if (ox < 0 || ox >= dStride) continue;
      const fx = (dx + 0.5) * scaleX - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const rx0 = resolveResizeEdge(x0, sw, edgeMode);
      const rx1 = resolveResizeEdge(x0 + 1, sw, edgeMode);
      const di = (oy * dStride + ox) * 4;
      const i00 = rx0 !== null && ry0 !== null ? ((source.y + ry0) * sStride + source.x + rx0) * 4 : -1;
      const i10 = rx1 !== null && ry0 !== null ? ((source.y + ry0) * sStride + source.x + rx1) * 4 : -1;
      const i01 = rx0 !== null && ry1 !== null ? ((source.y + ry1) * sStride + source.x + rx0) * 4 : -1;
      const i11 = rx1 !== null && ry1 !== null ? ((source.y + ry1) * sStride + source.x + rx1) * 4 : -1;
      for (let c = 0; c < 4; c++) {
        let v00 = i00 >= 0 ? sd[i00 + c] : 0;
        let v10 = i10 >= 0 ? sd[i10 + c] : 0;
        let v01 = i01 >= 0 ? sd[i01 + c] : 0;
        let v11 = i11 >= 0 ? sd[i11 + c] : 0;
        if (premultiplied && c < 3) {
          v00 = i00 >= 0 ? (v00 * sd[i00 + 3]) / 255 : 0;
          v10 = i10 >= 0 ? (v10 * sd[i10 + 3]) / 255 : 0;
          v01 = i01 >= 0 ? (v01 * sd[i01 + 3]) / 255 : 0;
          v11 = i11 >= 0 ? (v11 * sd[i11 + 3]) / 255 : 0;
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
  invalidateImageResource(dest.surface);
}

function catmullRomWeight(t: number): number {
  const a = Math.abs(t);
  if (a >= 2) return 0;
  if (a >= 1) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 1.5 * a * a * a - 2.5 * a * a + 1;
}

function resolveResizeEdge(v: number, size: number, mode: SurfaceEdgeMode): number | null {
  if (v >= 0 && v < size) return v;
  switch (mode) {
    case 'clamp':
      return Math.max(0, Math.min(size - 1, v));
    case 'wrap':
      return ((v % size) + size) % size;
    case 'mirror': {
      const period = 2 * size;
      const wrapped = ((v % period) + period) % period;
      return wrapped < size ? wrapped : period - 1 - wrapped;
    }
    default:
      return null;
  }
}
