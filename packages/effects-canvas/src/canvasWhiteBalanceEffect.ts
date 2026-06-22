import type { CanvasRenderEffectRunner, CanvasRenderTarget, WhiteBalanceEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// White balance (PASSTHROUGH): a per-channel temperature/tint shift has no CSS filter equivalent (only
// the coarse colorGrade hue approximation exists). Shader-only here.
export function applyWhiteBalanceEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<WhiteBalanceEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasWhiteBalanceEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyWhiteBalanceEffectToCanvas(ctx.source, ctx.dest, effect as WhiteBalanceEffect);
};
