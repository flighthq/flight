import type { ColorLut, ColorTransformFunction } from '@flighthq/types';

/**
 * Baked-LUT math: compose a stack of pointwise rgb→rgb transforms into ONE 3D color lookup table, and
 * sample it. This is the LUT-tier fuse (the sibling of colorMatrixMath's `fuseColorMatrices`): where a
 * run of adjustments is not a pure affine matrix (gamma, hue/saturation, a supplied grade LUT), it
 * bakes into a single `ColorLut` evaluated once at each cell and applied as one trilinear tap. The
 * transforms must be continuous — the trilinear tap interpolates between cells, so hard-step ops
 * (posterize, threshold, quantize) are Effects with a dedicated per-op pass, not LUT adjustments.
 *
 * All color values are normalized `[0, 1]`. `samples` is `size³ · 3`, R fastest then G then B: cell
 * `(ri, gi, bi)` starts at `((bi · size + gi) · size + ri) · 3` (see the ColorLut type).
 */

/** Default per-axis LUT resolution. 32³ balances quality against upload/memory; raise it to cut banding. */
export const COLOR_LUT_DEFAULT_SIZE = 32;

/**
 * Bakes a stack of rgb→rgb transforms into one `ColorLut` of `size` cells per axis. The transforms apply
 * left-to-right (index 0 first) at each cell's unit-cube coordinate; an empty stack yields the identity
 * LUT. Evaluating the composed function once per cell is the whole point — arbitrary nonlinear stacks
 * collapse to a single texture without a per-op pass. Allocates the LUT. Baking is CPU-only (do it once
 * per stack, not per frame); larger `size` reduces banding at an `O(size³)` cost.
 */
export function bakeColorLut(
  transforms: ReadonlyArray<ColorTransformFunction>,
  size: number = COLOR_LUT_DEFAULT_SIZE,
): ColorLut {
  const n = Math.max(2, Math.floor(size));
  const samples = new Array<number>(n * n * n * 3);
  const denom = n - 1;
  const cell: [number, number, number] = [0, 0, 0];
  let i = 0;
  for (let bi = 0; bi < n; bi++) {
    const b = bi / denom;
    for (let gi = 0; gi < n; gi++) {
      const g = gi / denom;
      for (let ri = 0; ri < n; ri++) {
        cell[0] = ri / denom;
        cell[1] = g;
        cell[2] = b;
        for (let k = 0; k < transforms.length; k++) transforms[k](cell, cell[0], cell[1], cell[2]);
        samples[i++] = clamp01(cell[0]);
        samples[i++] = clamp01(cell[1]);
        samples[i++] = clamp01(cell[2]);
      }
    }
  }
  return { size: n, samples };
}

/**
 * Trilinearly samples `lut` at normalized `(r, g, b)` (clamped to the cube) and writes the RGB result
 * into `out`. The CPU counterpart of the GPU's hardware-filtered 3D texture tap; used by the Canvas LUT
 * pass and by tests. Alias-safe with respect to `out`.
 */
export function sampleColorLut(
  lut: Readonly<ColorLut>,
  out: [number, number, number],
  r: number,
  g: number,
  b: number,
): void {
  const n = lut.size;
  const s = lut.samples;
  const max = n - 1;
  const fr = clamp01(r) * max;
  const fg = clamp01(g) * max;
  const fb = clamp01(b) * max;
  const r0 = Math.floor(fr);
  const g0 = Math.floor(fg);
  const b0 = Math.floor(fb);
  const r1 = Math.min(r0 + 1, max);
  const g1 = Math.min(g0 + 1, max);
  const b1 = Math.min(b0 + 1, max);
  const dr = fr - r0;
  const dg = fg - g0;
  const db = fb - b0;
  for (let c = 0; c < 3; c++) {
    const c000 = s[((b0 * n + g0) * n + r0) * 3 + c];
    const c100 = s[((b0 * n + g0) * n + r1) * 3 + c];
    const c010 = s[((b0 * n + g1) * n + r0) * 3 + c];
    const c110 = s[((b0 * n + g1) * n + r1) * 3 + c];
    const c001 = s[((b1 * n + g0) * n + r0) * 3 + c];
    const c101 = s[((b1 * n + g0) * n + r1) * 3 + c];
    const c011 = s[((b1 * n + g1) * n + r0) * 3 + c];
    const c111 = s[((b1 * n + g1) * n + r1) * 3 + c];
    const c00 = c000 + (c100 - c000) * dr;
    const c10 = c010 + (c110 - c010) * dr;
    const c01 = c001 + (c101 - c001) * dr;
    const c11 = c011 + (c111 - c011) * dr;
    const c0 = c00 + (c10 - c00) * dg;
    const c1 = c01 + (c11 - c01) * dg;
    out[c] = c0 + (c1 - c0) * db;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
