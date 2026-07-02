import type { CanvasRenderEffectRunner, CanvasRenderTarget, TaaEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// TAA (PASSTHROUGH): temporal accumulation blends the current frame with reprojected prior frames.
// Genuinely unsupportable on Canvas 2D: needs temporal history (prior frames) plus jitter the
// single-frame 2D context does not retain. Passthrough.
export function applyTaaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<TaaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasTaaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyTaaEffectToCanvas(ctx.source, ctx.dest, effect as TaaEffect);
};
