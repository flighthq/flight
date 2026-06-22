import type { CanvasRenderEffectRunner, CanvasRenderTarget, ExposureEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Exposure (PASSTHROUGH): scaling linear color by 2^stops needs HDR headroom (values above 1.0) that an
// 8-bit Canvas 2D context cannot hold. Shader-only / HDR-only.
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
