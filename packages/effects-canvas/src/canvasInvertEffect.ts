import type { CanvasRenderEffectRunner, CanvasRenderTarget, InvertEffect } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';

// Invert (REAL): CSS invert(intensity).
export function applyInvertEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<InvertEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  drawCanvasEffectPass(dest, source, `invert(${intensity})`);
}

export const defaultCanvasInvertEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyInvertEffectToCanvas(ctx.source, ctx.dest, effect as InvertEffect);
};
