import type { SurfaceRegion } from '@flighthq/types';

/**
 * Applies a 4×5 color matrix to `source` and writes into `out`.
 * `out` must be at least `source.width * source.height * 4` bytes.
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface — each pixel's input channels are read before any channel
 * of that pixel is written.
 */
export function applySurfaceColorMatrixFilter(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  matrix: ReadonlyArray<number>,
): void {
  if (matrix.length < 20) throw new Error('Color matrix filter requires 20 values');

  for (let py = 0; py < source.height; py++) {
    const sourceY = source.y + py;
    if (sourceY < 0 || sourceY >= source.surface.height) continue;
    for (let px = 0; px < source.width; px++) {
      const sourceX = source.x + px;
      if (sourceX < 0 || sourceX >= source.surface.width) continue;
      const si = (sourceY * source.surface.width + sourceX) * 4;
      const di = (py * source.width + px) * 4;
      const r = source.surface.data[si];
      const g = source.surface.data[si + 1];
      const b = source.surface.data[si + 2];
      const a = source.surface.data[si + 3];
      out[di] = clampByte(r * matrix[0] + g * matrix[1] + b * matrix[2] + a * matrix[3] + matrix[4]);
      out[di + 1] = clampByte(r * matrix[5] + g * matrix[6] + b * matrix[7] + a * matrix[8] + matrix[9]);
      out[di + 2] = clampByte(r * matrix[10] + g * matrix[11] + b * matrix[12] + a * matrix[13] + matrix[14]);
      out[di + 3] = clampByte(r * matrix[15] + g * matrix[16] + b * matrix[17] + a * matrix[18] + matrix[19]);
    }
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
