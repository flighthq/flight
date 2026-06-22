import type { BokehDepthOfFieldEffect, CanvasRenderEffectRunner, CanvasRenderTarget } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Bokeh depth-of-field (PASSTHROUGH): a per-pixel circle-of-confusion blur driven by a depth buffer.
// Canvas 2D has no depth attachment and no per-pixel variable blur. Shader-only / depth-only.
export function applyBokehDepthOfFieldEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<BokehDepthOfFieldEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasBokehDepthOfFieldEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyBokehDepthOfFieldEffectToCanvas(ctx.source, ctx.dest, effect as BokehDepthOfFieldEffect);
};
