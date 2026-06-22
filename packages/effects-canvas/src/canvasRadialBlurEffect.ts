import type { CanvasRenderEffectRunner, CanvasRenderTarget, RadialBlurEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Radial blur (PASSTHROUGH): accumulating taps toward a center point is a per-pixel multi-tap gather
// with no 2D draw-op path. Shader-only.
export function applyRadialBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<RadialBlurEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasRadialBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyRadialBlurEffectToCanvas(ctx.source, ctx.dest, effect as RadialBlurEffect);
};
