import type { CanvasRenderEffectRunner, CanvasRenderTarget, ColorGradeEffect } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';

// Color grade (REAL): compose CSS brightness/contrast/saturate/hue-rotate. Exposure maps to a
// brightness multiplier (2^exposure), saturation to saturate(), contrast to contrast(). Temperature and
// tint are approximated as a small hue rotation — Canvas/CSS has no per-channel temperature primitive,
// so the warm/cool shift is a coarse approximation of the Gl recipe.
export function applyColorGradeEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<ColorGradeEffect>,
): void {
  const exposure = Math.pow(2, effect.exposure ?? 0);
  const brightness = exposure + (effect.brightness ?? 0);
  const contrast = effect.contrast ?? 1;
  const saturation = effect.saturation ?? 1;
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  // Approximate temperature/tint as a hue rotation: warm (+temperature) skews toward red/orange,
  // tint toward green/magenta. Coarse but keeps the look directionally consistent with Gl.
  const hueDegrees = -temperature * 20 + tint * 10;
  drawCanvasEffectPass(
    dest,
    source,
    `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hueDegrees}deg)`,
  );
}

export const defaultCanvasColorGradeEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyColorGradeEffectToCanvas(ctx.source, ctx.dest, effect as ColorGradeEffect);
};
