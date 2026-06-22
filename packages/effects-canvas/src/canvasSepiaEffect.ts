import type { CanvasRenderEffectRunner, CanvasRenderTarget, SepiaEffect } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';

// Sepia (REAL): CSS sepia(intensity).
export function applySepiaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<SepiaEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  drawCanvasEffectPass(dest, source, `sepia(${intensity})`);
}

export const defaultCanvasSepiaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySepiaEffectToCanvas(ctx.source, ctx.dest, effect as SepiaEffect);
};
