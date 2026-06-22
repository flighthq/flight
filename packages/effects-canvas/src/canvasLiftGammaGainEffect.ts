import type { CanvasRenderEffectRunner, CanvasRenderTarget, LiftGammaGainEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Lift/gamma/gain (PASSTHROUGH): per-channel offset/exponent/multiplier color wheels need per-pixel
// pow()/mul math with no CSS filter equivalent. Shader-only.
export function applyLiftGammaGainEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LiftGammaGainEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasLiftGammaGainEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLiftGammaGainEffectToCanvas(ctx.source, ctx.dest, effect as LiftGammaGainEffect);
};
