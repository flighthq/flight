import type { CanvasRenderEffectRunner, CanvasRenderTarget, OutlineEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Outline (PASSTHROUGH): Sobel edge detection on luminance is a per-pixel neighbor-sampling shader with
// no 2D draw-op path. Shader-only.
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
