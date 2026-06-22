import type { BrightnessContrastEffect, CanvasRenderEffectRunner, CanvasRenderTarget } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';

// Brightness/contrast (REAL): CSS brightness()/contrast(). The intent's brightness is an additive
// offset around 0 (neutral 0) and contrast a multiplier around 1 (neutral 1); CSS brightness()/
// contrast() are both multipliers around 1, so brightness is mapped to 1 + offset.
export function applyBrightnessContrastEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<BrightnessContrastEffect>,
): void {
  const brightness = 1 + (effect.brightness ?? 0);
  const contrast = effect.contrast ?? 1;
  drawCanvasEffectPass(dest, source, `brightness(${brightness}) contrast(${contrast})`);
}

export const defaultCanvasBrightnessContrastEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyBrightnessContrastEffectToCanvas(ctx.source, ctx.dest, effect as BrightnessContrastEffect);
};
