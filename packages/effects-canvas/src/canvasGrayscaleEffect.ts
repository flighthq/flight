import type { CanvasRenderEffectRunner, CanvasRenderTarget, GrayscaleEffect } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';

// Grayscale (REAL): CSS grayscale(intensity).
export function applyGrayscaleEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<GrayscaleEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  drawCanvasEffectPass(dest, source, `grayscale(${intensity})`);
}

export const defaultCanvasGrayscaleEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyGrayscaleEffectToCanvas(ctx.source, ctx.dest, effect as GrayscaleEffect);
};
