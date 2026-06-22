import type { CanvasRenderEffectRunner, CanvasRenderTarget, HalftoneEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Halftone (PASSTHROUGH): a rotated dot grid carved by per-pixel luminance has no 2D draw-op path.
// Shader-only.
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
