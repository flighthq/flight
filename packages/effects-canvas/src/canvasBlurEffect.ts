import type { BlurEffect, CanvasRenderEffectRunner, CanvasRenderTarget } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';

// Plain Gaussian blur via the Canvas 2D `blur()` CSS filter — the same primitive the canvas bloom
// branch uses. Canvas `blur()` is isotropic (a single radius), so the per-axis `blurX`/`blurY` sigmas
// are averaged into one radius; a non-positive radius passes the image through unchanged.
export function applyBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<BlurEffect>,
): void {
  const blurX = effect.blurX ?? 4;
  const blurY = effect.blurY ?? 4;
  const radius = Math.max(0, (blurX + blurY) / 2);
  drawCanvasEffectPass(dest, source, radius > 0 ? `blur(${radius}px)` : 'none');
}

export const defaultCanvasBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyBlurEffectToCanvas(ctx.source, ctx.dest, effect as BlurEffect);
};
