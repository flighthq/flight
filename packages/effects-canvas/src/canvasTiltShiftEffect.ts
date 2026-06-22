import type { CanvasRenderEffectRunner, CanvasRenderTarget, TiltShiftEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Tilt-shift (PASSTHROUGH): a focus band with blur ramping outside it needs per-pixel variable blur the
// uniform CSS blur() cannot express. Shader-only.
export function applyTiltShiftEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<TiltShiftEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasTiltShiftEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyTiltShiftEffectToCanvas(ctx.source, ctx.dest, effect as TiltShiftEffect);
};
