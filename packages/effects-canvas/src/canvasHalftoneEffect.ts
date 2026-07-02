import type { CanvasRenderEffectRunner, CanvasRenderTarget, HalftoneEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Halftone (PASSTHROUGH): a rotated dot grid carved by per-pixel luminance. No CSS filter equivalent,
// but expressible per-pixel via getImageData/putImageData; not yet implemented — passthrough for now.
export function applyHalftoneEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<HalftoneEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasHalftoneEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyHalftoneEffectToCanvas(ctx.source, ctx.dest, effect as HalftoneEffect);
};
