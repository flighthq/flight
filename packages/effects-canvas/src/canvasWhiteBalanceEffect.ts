import type { CanvasRenderEffectRunner, CanvasRenderTarget, WhiteBalanceEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// White balance (PASSTHROUGH): a per-channel temperature/tint shift (only the coarse colorGrade hue
// approximation exists as CSS). No CSS filter equivalent for the full effect, but expressible per-pixel
// via getImageData/putImageData; not yet implemented — passthrough for now.
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
