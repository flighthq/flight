import type { CanvasRenderEffectRunner, CanvasRenderTarget, DirectionalBlurEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Directional blur (PASSTHROUGH): accumulating taps stepped along an angle is a per-pixel multi-tap
// gather with no 2D draw-op path. Shader-only.
export function applyDirectionalBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<DirectionalBlurEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasDirectionalBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyDirectionalBlurEffectToCanvas(ctx.source, ctx.dest, effect as DirectionalBlurEffect);
};
