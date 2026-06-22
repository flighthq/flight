import type { CanvasRenderEffectRunner, CanvasRenderTarget, MotionBlurEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Motion blur (PASSTHROUGH): per-object smearing reads a per-pixel velocity buffer Canvas 2D never
// writes, and accumulates taps along each fragment's vector. Shader-only / velocity-only.
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
