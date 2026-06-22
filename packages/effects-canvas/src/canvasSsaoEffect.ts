import type { CanvasRenderEffectRunner, CanvasRenderTarget, SsaoEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// SSAO (PASSTHROUGH): ambient occlusion reconstructs view-space position/normals from a depth buffer
// and accumulates a sampling kernel — none of which exists on Canvas 2D. Shader-only / depth-only.
export function applySsaoEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SsaoEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasSsaoEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySsaoEffectToCanvas(ctx.source, ctx.dest, effect as SsaoEffect);
};
