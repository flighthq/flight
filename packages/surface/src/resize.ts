import type { SurfaceRegion } from '@flighthq/types';

export type SurfaceResizeMode = 'bilinear' | 'nearest';

/**
 * Resamples the `source` region into the `dest` region; `dest`'s dimensions
 * define the target size. `'nearest'` is fast and preserves hard edges (pixel
 * art); `'bilinear'` (default) interpolates the four surrounding source pixels
 * for smooth scaling. Sampled source coordinates are clamped to the source
 * region; destination pixels outside `dest.surface` are skipped.
 *
 * Bilinear blends in straight-alpha space, so semi-transparent edges can show
 * the usual dark-halo bleed; premultiply the source first if that matters.
 *
 * `dest` must not alias `source` — output pixels read arbitrary source
 * positions, so an in-place resize would corrupt later reads.
 */
export function resizeSurface(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  mode: SurfaceResizeMode = 'bilinear',
): void {
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
        const top = sd[i00 + c] * (1 - tx) + sd[i10 + c] * tx;
        const bottom = sd[i01 + c] * (1 - tx) + sd[i11 + c] * tx;
        dd[di + c] = Math.round(top * (1 - ty) + bottom * ty);
      }
    }
  }
}
