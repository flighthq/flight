import { sampleColorLut } from '@flighthq/adjustments';
import type { CanvasRenderTarget, ColorLut } from '@flighthq/types';

import { drawCanvasImageDataPass } from './canvasEffectCompositing';

// Generic pointwise color-LUT pass — the single fold-in realization for the whole LUT-tier Adjustment
// family on Canvas 2D. A run of consecutive pointwise adjustments containing any nonlinear (LUT-tier)
// member bakes to ONE `ColorLut` (matrices folded in) and runs through this one per-pixel pass instead of
// one pass per op. Each pixel is normalized to [0,1], trilinearly sampled from the LUT (the CPU
// counterpart of the GPU's hardware-filtered 3D tap), and written back; alpha is preserved.
export function applyColorLutPassToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  lut: Readonly<ColorLut>,
): void {
  const rgb: [number, number, number] = [0, 0, 0];
  drawCanvasImageDataPass(dest, source, (data, pixelCount) => {
    for (let i = 0; i < pixelCount; i++) {
      const p = i * 4;
      sampleColorLut(lut, rgb, data[p] / 255, data[p + 1] / 255, data[p + 2] / 255);
      data[p] = rgb[0] * 255;
      data[p + 1] = rgb[1] * 255;
      data[p + 2] = rgb[2] * 255;
    }
  });
}
