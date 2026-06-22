import type { CanvasRenderEffectRunner, CanvasRenderTarget, HueSaturationEffect } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';

// Hue/saturation (REAL): CSS hue-rotate(degrees) + saturate(). Lightness has no CSS filter equivalent
// and is folded into brightness() as a coarse approximation (additive lightness ~ brightness offset).
export function applyHueSaturationEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<HueSaturationEffect>,
): void {
  const hue = effect.hue ?? 0;
  const saturation = effect.saturation ?? 1;
  const lightness = 1 + (effect.lightness ?? 0);
  drawCanvasEffectPass(dest, source, `hue-rotate(${hue}deg) saturate(${saturation}) brightness(${lightness})`);
}

export const defaultCanvasHueSaturationEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyHueSaturationEffectToCanvas(ctx.source, ctx.dest, effect as HueSaturationEffect);
};
