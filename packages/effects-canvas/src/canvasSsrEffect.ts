import type { CanvasRenderEffectRunner, CanvasRenderTarget, SsrEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// SSR (PASSTHROUGH): screen-space reflections ray-march against depth using view-space normals; neither
// buffer exists on Canvas 2D. Shader-only / depth-only.
export function applySsrEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SsrEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasSsrEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySsrEffectToCanvas(ctx.source, ctx.dest, effect as SsrEffect);
};
