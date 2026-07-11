import type { CanvasRenderEffectRunner, CanvasRenderTarget, MedianEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Median (PASSTHROUGH): per-channel median over a neighborhood is per-pixel neighbor math. No CSS filter
// equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented — passthrough
// for now.
export function applyMedianEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<MedianEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasMedianEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyMedianEffectToCanvas(ctx.source, ctx.dest, effect as MedianEffect);
};
