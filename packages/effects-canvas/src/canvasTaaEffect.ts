import type { CanvasRenderEffectRunner, CanvasRenderTarget, TaaEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// TAA (PASSTHROUGH): temporal accumulation needs a history buffer and motion vectors absent from the
// single-frame Canvas context. Shader-only / temporal-only.
export function applyTaaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<TaaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasTaaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyTaaEffectToCanvas(ctx.source, ctx.dest, effect as TaaEffect);
};
