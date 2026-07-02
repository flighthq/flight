import type { CanvasRenderEffectRunner, CanvasRenderTarget, SsaoEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// SSAO (PASSTHROUGH): ambient occlusion reconstructs view-space position/normals and accumulates a
// sampling kernel. Genuinely unsupportable on Canvas 2D: needs a depth/normal G-buffer the 2D context
// does not expose. Passthrough.
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
