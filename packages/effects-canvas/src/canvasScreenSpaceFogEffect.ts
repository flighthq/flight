import type { CanvasRenderEffectRunner, CanvasRenderTarget, ScreenSpaceFogEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Screen-space fog (PASSTHROUGH): exponential fog attenuated by per-pixel scene depth.
// Genuinely unsupportable on Canvas 2D: needs a depth buffer the 2D context does not expose. Passthrough.
export function applyScreenSpaceFogEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ScreenSpaceFogEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasScreenSpaceFogEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyScreenSpaceFogEffectToCanvas(ctx.source, ctx.dest, effect as ScreenSpaceFogEffect);
};
