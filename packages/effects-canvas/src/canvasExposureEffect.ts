import type { CanvasRenderEffectRunner, CanvasRenderTarget, ExposureEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Exposure (PASSTHROUGH): scaling color by 2^stops. No CSS filter equivalent, but expressible per-pixel
// via getImageData/putImageData; not yet implemented — passthrough for now. (Operates on already-clamped
// 8-bit input, with no HDR headroom above 1.0, so the result is approximate.)
export function applyExposureEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ExposureEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasExposureEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyExposureEffectToCanvas(ctx.source, ctx.dest, effect as ExposureEffect);
};
