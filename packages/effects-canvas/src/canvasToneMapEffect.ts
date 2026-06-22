import type { CanvasRenderEffectRunner, CanvasRenderTarget, ToneMapEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Tone map (PASSTHROUGH): tone-mapping operators compress HDR linear light to displayable range; the
// source on Canvas 2D is already clamped 8-bit sRgb with no HDR to compress. Shader-only / HDR-only.
export function applyToneMapEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ToneMapEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasToneMapEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyToneMapEffectToCanvas(ctx.source, ctx.dest, effect as ToneMapEffect);
};
