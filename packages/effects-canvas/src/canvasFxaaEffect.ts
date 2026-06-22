import type { CanvasRenderEffectRunner, CanvasRenderTarget, FxaaEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// FXAA (PASSTHROUGH): luminance edge detection + directional blend is per-pixel neighbor sampling with
// no CSS/draw-op equivalent. Shader-only.
export function applyFxaaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<FxaaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasFxaaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyFxaaEffectToCanvas(ctx.source, ctx.dest, effect as FxaaEffect);
};
