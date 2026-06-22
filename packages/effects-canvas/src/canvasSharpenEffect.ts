import type { CanvasRenderEffectRunner, CanvasRenderTarget, SharpenEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Sharpen (PASSTHROUGH): a Laplacian unsharp-mask kernel is per-pixel neighbor math with no CSS/draw-op
// equivalent. Shader-only.
export function applySharpenEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SharpenEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasSharpenEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySharpenEffectToCanvas(ctx.source, ctx.dest, effect as SharpenEffect);
};
