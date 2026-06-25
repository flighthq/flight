import { invalidateImageResource } from '@flighthq/image';
import type { SurfaceEdgeMode, SurfaceRegion, SurfaceResizeMode } from '@flighthq/types';

/**
 * Applies a full 2×3 affine transform to the `source` region, writing into
 * `dest`. The `matrix` is a 6-element array `[a, b, c, d, e, f]` representing:
 *
 * ```
 *   [ a  c  e ]
 *   [ b  d  f ]
 * ```
 *
 * Maps each `dest` pixel `(x, y)` back to source coordinates by the inverse
 * transform:
 *
 * ```
 *   srcX = a * x + c * y + e
 *   srcY = b * x + d * y + f
 * ```
 *
 * This is a forward-mapping: for each output pixel the source position is
 * computed, then sampled according to `sampleMode` (default `'bilinear'`).
 * Out-of-bounds source positions are resolved with `edgeMode` (default
 * `'transparent'`).
 *
 * `dest` must not alias `source` when their regions overlap.
 */
export function transformSurface(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  matrix: Readonly<[number, number, number, number, number, number]>,
  edgeMode: SurfaceEdgeMode = 'transparent',
  sampleMode: SurfaceResizeMode = 'bilinear',
): void {
  const dw = dest.width;
  const dh = dest.height;
  const sw = source.width;
  const sh = source.height;
  if (dw === 0 || dh === 0 || sw === 0 || sh === 0) return;
  const [a, b, c, d, e, f] = matrix;
  const sd = source.surface.data;
  const dd = dest.surface.data;
  const sStride = source.surface.width;
  const dStride = dest.surface.width;
  for (let dy = 0; dy < dh; dy++) {
    const oy = dest.y + dy;
    if (oy < 0 || oy >= dest.surface.height) continue;
    for (let dx = 0; dx < dw; dx++) {
      const ox = dest.x + dx;
      if (ox < 0 || ox >= dStride) continue;
      // Map dest pixel to source coordinates.
      const sx = a * dx + c * dy + e;
      const sy = b * dx + d * dy + f;
      const di = (oy * dStride + ox) * 4;
      sampleSurface(
        dd,
        di,
        sd,
        sw,
        sh,
        source.x,
        source.y,
        sStride,
        source.surface.height,
        sx,
        sy,
        sampleMode,
        edgeMode,
      );
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Samples the source surface at fractional coordinates `(sx, sy)` in
 * source-region-local space, writing the result into `dd[di..di+3]`. Edge
 * behaviour is controlled by `edgeMode`; sampling quality by `sampleMode`.
 */
function sampleSurface(
  dd: Uint8ClampedArray,
  di: number,
  sd: Readonly<Uint8ClampedArray>,
  sw: number,
  sh: number,
  originX: number,
  originY: number,
  sStride: number,
  sHeight: number,
  sx: number,
  sy: number,
  sampleMode: SurfaceResizeMode,
  edgeMode: SurfaceEdgeMode,
): void {
  if (sampleMode === 'nearest') {
    const ix = Math.round(sx);
    const iy = Math.round(sy);
    const cx = resolveEdge(ix, sw, edgeMode);
    const cy = resolveEdge(iy, sh, edgeMode);
    if (cx === null || cy === null) {
      writeTransparent(dd, di);
      return;
    }
    const si = ((originY + cy) * sStride + (originX + cx)) * 4;
    dd[di] = sd[si];
    dd[di + 1] = sd[si + 1];
    dd[di + 2] = sd[si + 2];
    dd[di + 3] = sd[si + 3];
    return;
  }
  if (sampleMode === 'bicubic') {
    sampleBicubic(dd, di, sd, sw, sh, originX, originY, sStride, sHeight, sx, sy, edgeMode);
    return;
  }
  // bilinear (default)
  sampleBilinear(dd, di, sd, sw, sh, originX, originY, sStride, sHeight, sx, sy, edgeMode);
}

function sampleBilinear(
  dd: Uint8ClampedArray,
  di: number,
  sd: Readonly<Uint8ClampedArray>,
  sw: number,
  sh: number,
  originX: number,
  originY: number,
  sStride: number,
  _sHeight: number,
  sx: number,
  sy: number,
  edgeMode: SurfaceEdgeMode,
): void {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = sx - x0;
  const ty = sy - y0;
  const cx00 = resolveEdge(x0, sw, edgeMode);
  const cx10 = resolveEdge(x0 + 1, sw, edgeMode);
  const cy00 = resolveEdge(y0, sh, edgeMode);
  const cy10 = resolveEdge(y0 + 1, sh, edgeMode);
  for (let c = 0; c < 4; c++) {
    const v00 = cx00 !== null && cy00 !== null ? sd[((originY + cy00) * sStride + originX + cx00) * 4 + c] : 0;
    const v10 = cx10 !== null && cy00 !== null ? sd[((originY + cy00) * sStride + originX + cx10) * 4 + c] : 0;
    const v01 = cx00 !== null && cy10 !== null ? sd[((originY + cy10) * sStride + originX + cx00) * 4 + c] : 0;
    const v11 = cx10 !== null && cy10 !== null ? sd[((originY + cy10) * sStride + originX + cx10) * 4 + c] : 0;
    const top = v00 * (1 - tx) + v10 * tx;
    const bottom = v01 * (1 - tx) + v11 * tx;
    dd[di + c] = Math.round(top * (1 - ty) + bottom * ty);
  }
}

function sampleBicubic(
  dd: Uint8ClampedArray,
  di: number,
  sd: Readonly<Uint8ClampedArray>,
  sw: number,
  sh: number,
  originX: number,
  originY: number,
  sStride: number,
  _sHeight: number,
  sx: number,
  sy: number,
  edgeMode: SurfaceEdgeMode,
): void {
  const x1 = Math.floor(sx);
  const y1 = Math.floor(sy);
  const tx = sx - x1;
  const ty = sy - y1;
  for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let m = -1; m <= 2; m++) {
      const wy = catmullRomWeight(ty - m);
      const ry = resolveEdge(y1 + m, sh, edgeMode);
      for (let n = -1; n <= 2; n++) {
        const wx = catmullRomWeight(tx - n);
        const rx = resolveEdge(x1 + n, sw, edgeMode);
        const v = rx !== null && ry !== null ? sd[((originY + ry) * sStride + originX + rx) * 4 + c] : 0;
        sum += v * wy * wx;
      }
    }
    dd[di + c] = Math.max(0, Math.min(255, Math.round(sum)));
  }
}

/**
 * Maps a local coordinate `v` in `[0, size)` using the edge mode.
 * Returns `null` for `'transparent'` when out of bounds.
 */
function resolveEdge(v: number, size: number, mode: SurfaceEdgeMode): number | null {
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
      // 'transparent'
      return null;
  }
}

function catmullRomWeight(t: number): number {
  const a = Math.abs(t);
  if (a >= 2) return 0;
  if (a >= 1) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 1.5 * a * a * a - 2.5 * a * a + 1;
}

function writeTransparent(dd: Uint8ClampedArray, di: number): void {
  dd[di] = 0;
  dd[di + 1] = 0;
  dd[di + 2] = 0;
  dd[di + 3] = 0;
}
