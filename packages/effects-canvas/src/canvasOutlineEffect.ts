import type { CanvasRenderEffectRunner, CanvasRenderTarget, OutlineEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Outline (PASSTHROUGH): Sobel edge detection on luminance is per-pixel neighbor sampling. No CSS filter
// equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented — passthrough
// for now.
export function applyOutlineEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<OutlineEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasOutlineEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyOutlineEffectToCanvas(ctx.source, ctx.dest, effect as OutlineEffect);
};
