import type { CanvasRenderEffectRunner, CanvasRenderTarget, DitherEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Dither (PASSTHROUGH): ordered-Bayer quantization is per-pixel threshold math with no CSS/draw-op
// equivalent. Shader-only.
export function applyDitherEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<DitherEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasDitherEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyDitherEffectToCanvas(ctx.source, ctx.dest, effect as DitherEffect);
};
