import type { CanvasRenderEffectRunner, CanvasRenderTarget, PosterizeEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Posterize (PASSTHROUGH): per-channel quantization to discrete levels. No CSS filter equivalent, but
// expressible per-pixel via getImageData/putImageData; not yet implemented — passthrough for now.
export function applyPosterizeEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<PosterizeEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasPosterizeEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyPosterizeEffectToCanvas(ctx.source, ctx.dest, effect as PosterizeEffect);
};
