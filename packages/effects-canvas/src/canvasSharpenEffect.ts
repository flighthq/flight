import type { CanvasRenderEffectRunner, CanvasRenderTarget, SharpenEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Sharpen (PASSTHROUGH): a Laplacian unsharp-mask kernel is per-pixel neighbor math. No CSS filter
// equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented — passthrough
// for now.
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
