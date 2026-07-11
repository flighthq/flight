import type { CanvasRenderTarget } from '@flighthq/types';

import { drawCanvasImageDataPass } from './canvasEffectCompositing';

// Generic pointwise color-matrix pass — the single fold-in realization for the whole matrix-tier
// Adjustment family on Canvas 2D. A run of consecutive matrix-tier adjustments fuses to ONE 4×5 matrix
// (in the adjustments colorMatrixMath convention: linear RGBA coefficients + a 0–255 offset column) and
// runs through this one per-pixel pass instead of one pass per op. ImageData is straight-alpha 0–255 —
// the same units the offset column is in — so the matrix applies directly, clamped per channel.
export function applyColorMatrixPassToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  matrix: ReadonlyArray<number>,
): void {
  const m0 = matrix[0] ?? 0;
  const m1 = matrix[1] ?? 0;
  const m2 = matrix[2] ?? 0;
  const m3 = matrix[3] ?? 0;
  const m4 = matrix[4] ?? 0;
  const m5 = matrix[5] ?? 0;
  const m6 = matrix[6] ?? 0;
  const m7 = matrix[7] ?? 0;
  const m8 = matrix[8] ?? 0;
  const m9 = matrix[9] ?? 0;
  const m10 = matrix[10] ?? 0;
  const m11 = matrix[11] ?? 0;
  const m12 = matrix[12] ?? 0;
  const m13 = matrix[13] ?? 0;
  const m14 = matrix[14] ?? 0;
  const m15 = matrix[15] ?? 0;
  const m16 = matrix[16] ?? 0;
  const m17 = matrix[17] ?? 0;
  const m18 = matrix[18] ?? 0;
  const m19 = matrix[19] ?? 0;
  drawCanvasImageDataPass(dest, source, (data, pixelCount) => {
    for (let i = 0; i < pixelCount; i++) {
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const a = data[p + 3];
      // Uint8ClampedArray clamps stores to 0–255, so an explicit clamp is unnecessary.
      data[p] = m0 * r + m1 * g + m2 * b + m3 * a + m4;
      data[p + 1] = m5 * r + m6 * g + m7 * b + m8 * a + m9;
      data[p + 2] = m10 * r + m11 * g + m12 * b + m13 * a + m14;
      data[p + 3] = m15 * r + m16 * g + m17 * b + m18 * a + m19;
    }
  });
}
