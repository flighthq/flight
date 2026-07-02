import type { CanvasRenderEffectRunner, CanvasRenderTarget, MotionBlurEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Motion blur (PASSTHROUGH): per-object smearing accumulates taps along each fragment's motion vector.
// Genuinely unsupportable on Canvas 2D: needs a per-pixel velocity buffer the 2D context does not
// expose. Passthrough.
export function applyMotionBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<MotionBlurEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasMotionBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyMotionBlurEffectToCanvas(ctx.source, ctx.dest, effect as MotionBlurEffect);
};
