import { invalidateImageResource } from '@flighthq/image';
import type { SurfaceEdgeMode, SurfaceRegion, SurfaceResizeMode } from '@flighthq/types';

/**
 * Applies a full 3×3 projective (homography) warp to `source`, writing into
 * `dest`. The `matrix` is a 9-element row-major array representing:
 *
 * ```
 *   [ m0  m1  m2 ]
 *   [ m3  m4  m5 ]
 *   [ m6  m7  m8 ]
 * ```
 *
 * For each `dest` pixel `(x, y)`, the inverse matrix is applied as:
 *
 * ```
 *   w   = m6*x + m7*y + m8
 *   srcX = (m0*x + m1*y + m2) / w
 *   srcY = (m3*x + m4*y + m5) / w
 * ```
 *
 * This is an inverse-mapping (destination-driven) warp, so every output pixel
 * is filled by sampling `source`. Out-of-bounds source positions are resolved
 * with `edgeMode` (default `'transparent'`). Sampling quality is controlled
 * by `sampleMode` (default `'bilinear'`).
 *
 * Pass the **inverse** of the forward transform: if you want to map source
 * points into dest, compute the forward matrix and invert it before passing.
 *
 * `dest` must not alias `source` when their regions overlap.
 */
export function warpSurface(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  matrix: Readonly<[number, number, number, number, number, number, number, number, number]>,
  edgeMode: SurfaceEdgeMode = 'transparent',
  sampleMode: SurfaceResizeMode = 'bilinear',
): void {
  const dw = dest.width;
  const dh = dest.height;
  const sw = source.width;
  const sh = source.height;
  if (dw === 0 || dh === 0 || sw === 0 || sh === 0) return;
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix;
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
      const w = m6 * dx + m7 * dy + m8;
      const di = (oy * dStride + ox) * 4;
      if (Math.abs(w) < 1e-10) {
        dd[di] = 0;
        dd[di + 1] = 0;
        dd[di + 2] = 0;
        dd[di + 3] = 0;
        continue;
      }
      const invW = 1 / w;
      const sx = (m0 * dx + m1 * dy + m2) * invW;
      const sy = (m3 * dx + m4 * dy + m5) * invW;
      warpSampleSurface(
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
 * Warps `source` into `dest` by mapping its four corners to the four corners of
 * `dstQuad`. This is a perspective warp (homography) defined by 4 destination
 * points corresponding to the source corners in order: top-left, top-right,
 * bottom-right, bottom-left.
 *
 * `dstQuad` is an 8-element array `[x0, y0, x1, y1, x2, y2, x3, y3]` in
 * destination-region-local coordinates. The source corners are mapped from the
 * full `source` region in the same order.
 *
 * Internally computes the homography from source corners to `dstQuad` corners,
 * inverts it, and delegates to `warpSurface`. Edge and sample modes follow the
 * same rules as `warpSurface`.
 *
 * `dest` must not alias `source` when their regions overlap.
 */
export function warpSurfaceQuad(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  dstQuad: Readonly<[number, number, number, number, number, number, number, number]>,
  edgeMode: SurfaceEdgeMode = 'transparent',
  sampleMode: SurfaceResizeMode = 'bilinear',
): void {
  const sw = source.width;
  const sh = source.height;
  if (sw === 0 || sh === 0 || dest.width === 0 || dest.height === 0) return;
  // Source corners in source-region-local space (top-left, top-right, bottom-right, bottom-left).
  const srcPts: [number, number, number, number, number, number, number, number] = [0, 0, sw, 0, sw, sh, 0, sh];
  // Compute homography: dstQuad ← srcPts (forward), then invert for the warp.
  const H = computeHomography(srcPts, dstQuad);
  if (H === null) return;
  const Hinv = invertMatrix3x3(H);
  if (Hinv === null) return;
  warpSurface(dest, source, Hinv, edgeMode, sampleMode);
}

/**
 * Samples `source` at source-region-local `(sx, sy)`, writing four bytes into
 * `dd[di..di+3]`.
 */
function warpSampleSurface(
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
    const cx = warpResolveEdge(ix, sw, edgeMode);
    const cy = warpResolveEdge(iy, sh, edgeMode);
    if (cx === null || cy === null) {
      dd[di] = 0;
      dd[di + 1] = 0;
      dd[di + 2] = 0;
      dd[di + 3] = 0;
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
    warpSampleBicubic(dd, di, sd, sw, sh, originX, originY, sStride, sHeight, sx, sy, edgeMode);
    return;
  }
  // bilinear
  warpSampleBilinear(dd, di, sd, sw, sh, originX, originY, sStride, sHeight, sx, sy, edgeMode);
}

function warpSampleBilinear(
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
  const cx00 = warpResolveEdge(x0, sw, edgeMode);
  const cx10 = warpResolveEdge(x0 + 1, sw, edgeMode);
  const cy00 = warpResolveEdge(y0, sh, edgeMode);
  const cy10 = warpResolveEdge(y0 + 1, sh, edgeMode);
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

function warpSampleBicubic(
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
      const ry = warpResolveEdge(y1 + m, sh, edgeMode);
      for (let n = -1; n <= 2; n++) {
        const wx = catmullRomWeight(tx - n);
        const rx = warpResolveEdge(x1 + n, sw, edgeMode);
        const v = rx !== null && ry !== null ? sd[((originY + ry) * sStride + originX + rx) * 4 + c] : 0;
        sum += v * wy * wx;
      }
    }
    dd[di + c] = Math.max(0, Math.min(255, Math.round(sum)));
  }
}

function warpResolveEdge(v: number, size: number, mode: SurfaceEdgeMode): number | null {
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

function catmullRomWeight(t: number): number {
  const a = Math.abs(t);
  if (a >= 2) return 0;
  if (a >= 1) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 1.5 * a * a * a - 2.5 * a * a + 1;
}

/**
 * Computes a homography H such that H * src[i] = dst[i] for 4 point pairs.
 * Points are in [x0, y0, x1, y1, x2, y2, x3, y3] order.
 * Returns null if the system is degenerate.
 */
function computeHomography(
  src: Readonly<[number, number, number, number, number, number, number, number]>,
  dst: Readonly<[number, number, number, number, number, number, number, number]>,
): readonly [number, number, number, number, number, number, number, number, number] | null {
  // Direct Linear Transform (DLT) for 4 point correspondences.
  // Builds an 8×8 linear system and solves it.
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i * 2];
    const sy = src[i * 2 + 1];
    const dx = dst[i * 2];
    const dy = dst[i * 2 + 1];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, -dx]);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, -dy]);
  }
  // Extract the 8×8 sub-system (h8 = 1 normalization).
  const b: number[] = [];
  const M: number[][] = [];
  for (let r = 0; r < 8; r++) {
    const row = A[r];
    M.push(row.slice(0, 8));
    b.push(row[8]);
  }
  const h = solveLinear8(M, b);
  if (h === null) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Gaussian elimination to solve M*x = b for 8 unknowns. */
function solveLinear8(M: Readonly<number[][]>, b: Readonly<number[]>): number[] | null {
  const n = 8;
  // Augmented matrix [M | -b] (we negate b because the system is A*x + b = 0).
  const aug = M.map((row, i) => [...row, -b[i]]);
  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row][col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
    }
    if (maxVal < 1e-12) return null;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let k = col; k <= n; k++) {
        aug[row][k] -= factor * aug[col][k];
      }
    }
  }
  // Back-substitution.
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = aug[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= aug[row][col] * x[col];
    }
    x[row] = sum / aug[row][row];
  }
  return x;
}

/**
 * Inverts a 3×3 matrix stored as a flat 9-element row-major array.
 * Returns null if the matrix is singular.
 */
function invertMatrix3x3(
  m: Readonly<[number, number, number, number, number, number, number, number, number]>,
): [number, number, number, number, number, number, number, number, number] | null {
  const [a, b, c, d, e, f, g, h, k] = m;
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  return [
    (e * k - f * h) * invDet,
    (c * h - b * k) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * k) * invDet,
    (a * k - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
}
