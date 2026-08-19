import type {
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  PosterizeEffect,
} from '@flighthq/types/contract';

import { drawCanvasImageDataPass } from './canvasEffectCompositing';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';

// Posterize (REAL): floor each channel to `levels` discrete steps, matching the Gl/Wgpu recipe
// `floor(c * levels) / (levels - 1)` exactly rather than approximating it.
//
// ★ THE QUANTISATION IS DONE PER PIXEL, NOT THROUGH A CSS FILTER, because no CSS filter expresses a
// step function. `drawCanvasImageDataPass` is the package's existing primitive for exactly this case,
// and its presence is the reason this cell was implementable at all: the scene had been declared a
// backend CONTROL on the belief that Canvas 2D can only reach what `ctx.filter` can spell.
//
// ★ THE 255-DOMAIN ROUNDING IS THE WHOLE DIFFICULTY. The GPU works in floats and writes an 8-bit result
// once, at the end. Doing the same arithmetic on bytes rounds twice — once reading the byte, once
// writing it — and a step function amplifies a half-level rounding difference into a whole band moving.
// So the byte is converted to the float domain, quantised there with the identical expression, and only
// then rounded back, with the same clamp the shader applies.
export function applyPosterizeEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<PosterizeEffect>,
): void {
  const levels = Math.max(2, effect.levels ?? 8);
  drawCanvasImageDataPass(dest, source, (data, pixelCount) => {
    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const at = pixel * 4;
      for (let channel = 0; channel < 3; channel++) {
        const value = data[at + channel]! / 255;
        const quantised = Math.floor(value * levels) / (levels - 1);
        data[at + channel] = Math.round(Math.max(0, Math.min(1, quantised)) * 255);
      }
    }
  });
}

export const defaultCanvasPosterizeEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyPosterizeEffectToCanvas(ctx.source, ctx.dest, effect as PosterizeEffect);
};

export function registerCanvasPosterizeEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'PosterizeEffect', defaultCanvasPosterizeEffectRunner);
}
