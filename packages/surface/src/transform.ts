import type { ColorTransformLike, Surface, SurfaceRegion, ThresholdOperation } from '@flighthq/types';

let _scrollScratch: Uint8ClampedArray | null = null;

/**
 * Applies a color transform to `source`, writing into `dest`. The transformed
 * size is the overlap of the two regions; pixels outside either surface are
 * skipped. Safe to pass the same surface and region in `dest` and `source` for
 * in-place modification (each pixel is read before it is written).
 */
export function applySurfaceColorTransform(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  ct: Readonly<ColorTransformLike>,
): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  for (let py = 0; py < h; py++) {
    const sy = source.y + py;
    const dy = dest.y + py;
    if (sy < 0 || sy >= source.surface.height || dy < 0 || dy >= dest.surface.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + px;
      const dx = dest.x + px;
      if (sx < 0 || sx >= source.surface.width || dx < 0 || dx >= dest.surface.width) continue;
      const si = (sy * source.surface.width + sx) * 4;
      const di = (dy * dest.surface.width + dx) * 4;
      const r = source.surface.data[si];
      const g = source.surface.data[si + 1];
      const b = source.surface.data[si + 2];
      const a = source.surface.data[si + 3];
      dest.surface.data[di] = Math.max(0, Math.min(255, Math.round(r * ct.redMultiplier + ct.redOffset)));
      dest.surface.data[di + 1] = Math.max(0, Math.min(255, Math.round(g * ct.greenMultiplier + ct.greenOffset)));
      dest.surface.data[di + 2] = Math.max(0, Math.min(255, Math.round(b * ct.blueMultiplier + ct.blueOffset)));
      dest.surface.data[di + 3] = Math.max(0, Math.min(255, Math.round(a * ct.alphaMultiplier + ct.alphaOffset)));
    }
  }
}

/**
 * Tests each pixel of `source` and writes `color` into `dest` where the test
 * passes, or optionally copies the source pixel where it fails. The tested size
 * is the overlap of the two regions. Returns the number of pixels that passed.
 *
 * Safe to pass the same surface and region in `dest` and `source` (each pixel
 * is read before it is written).
 */
export function applySurfaceThreshold(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  operation: ThresholdOperation,
  thresholdValue: number,
  color: number = 0,
  mask: number = 0xffffffff,
  copySource: boolean = false,
): number {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  const sd = source.surface.data;
  const dd = dest.surface.data;
  let changed = 0;
  for (let py = 0; py < h; py++) {
    const sy = source.y + py;
    const dy = dest.y + py;
    if (sy < 0 || sy >= source.surface.height || dy < 0 || dy >= dest.surface.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + px;
      const dx = dest.x + px;
      if (sx < 0 || sx >= source.surface.width || dx < 0 || dx >= dest.surface.width) continue;
      const si = (sy * source.surface.width + sx) * 4;
      const di = (dy * dest.surface.width + dx) * 4;
      const pixel = (((sd[si] << 24) | (sd[si + 1] << 16) | (sd[si + 2] << 8) | sd[si + 3]) & mask) >>> 0;
      const passes = compare(pixel, operation, thresholdValue >>> 0);
      if (passes) {
        dd[di] = (color >>> 24) & 0xff;
        dd[di + 1] = (color >> 16) & 0xff;
        dd[di + 2] = (color >> 8) & 0xff;
        dd[di + 3] = color & 0xff;
        changed++;
      } else if (copySource) {
        dd[di] = sd[si];
        dd[di + 1] = sd[si + 1];
        dd[di + 2] = sd[si + 2];
        dd[di + 3] = sd[si + 3];
      }
    }
  }
  return changed;
}

/**
 * Blends each channel of `source` into `dest` using per-channel multipliers in
 * the range [0, 256]: 0 keeps `dest`, 256 replaces with `source`, intermediate
 * values blend proportionally. The blended size is the overlap of the two
 * regions; pixels outside either surface are skipped.
 *
 * `dest` and `source` must not reference the same surface when their regions
 * overlap at different offsets — the blend reads both, so a write to `dest`
 * corrupts later reads from `source`. The same region in both is safe (the
 * result equals `dest` for every multiplier).
 */
export function mergeSurface(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  redMultiplier: number,
  greenMultiplier: number,
  blueMultiplier: number,
  alphaMultiplier: number,
): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  const sd = source.surface.data;
  const dd = dest.surface.data;
  for (let py = 0; py < h; py++) {
    const sy = source.y + py;
    const dy = dest.y + py;
    if (sy < 0 || sy >= source.surface.height || dy < 0 || dy >= dest.surface.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + px;
      const dx = dest.x + px;
      if (sx < 0 || sx >= source.surface.width || dx < 0 || dx >= dest.surface.width) continue;
      const si = (sy * source.surface.width + sx) * 4;
      const di = (dy * dest.surface.width + dx) * 4;
      dd[di] = Math.round((sd[si] * redMultiplier + dd[di] * (256 - redMultiplier)) / 256);
      dd[di + 1] = Math.round((sd[si + 1] * greenMultiplier + dd[di + 1] * (256 - greenMultiplier)) / 256);
      dd[di + 2] = Math.round((sd[si + 2] * blueMultiplier + dd[di + 2] * (256 - blueMultiplier)) / 256);
      dd[di + 3] = Math.round((sd[si + 3] * alphaMultiplier + dd[di + 3] * (256 - alphaMultiplier)) / 256);
    }
  }
}

/**
 * Scrolls the content of `out` by `(dx, dy)`, wrapping at the edges.
 * Uses a module-level scratch buffer that grows as needed and is reused
 * across calls.
 */
export function scrollSurface(out: Surface, dx: number, dy: number): void {
  const needed = out.data.length;
  if (_scrollScratch === null || _scrollScratch.length < needed) {
    _scrollScratch = new Uint8ClampedArray(needed);
  }
  _scrollScratch.set(out.data, 0);

  out.data.fill(0);
  for (let py = 0; py < out.height; py++) {
    const srcY = (((py - dy) % out.height) + out.height) % out.height;
    for (let px = 0; px < out.width; px++) {
      const srcX = (((px - dx) % out.width) + out.width) % out.width;
      const si = (srcY * out.width + srcX) * 4;
      const di = (py * out.width + px) * 4;
      out.data[di] = _scrollScratch[si];
      out.data[di + 1] = _scrollScratch[si + 1];
      out.data[di + 2] = _scrollScratch[si + 2];
      out.data[di + 3] = _scrollScratch[si + 3];
    }
  }
}

function compare(a: number, op: ThresholdOperation, b: number): boolean {
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
  }
}
