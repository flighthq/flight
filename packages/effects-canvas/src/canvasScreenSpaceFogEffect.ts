import type { CanvasRenderEffectRunner, CanvasRenderTarget, ScreenSpaceFogEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Screen-space fog (PASSTHROUGH): exponential fog by per-pixel depth needs a sampleable depth buffer
// Canvas 2D does not write. Shader-only / depth-only.
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
