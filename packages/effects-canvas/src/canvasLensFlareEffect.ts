import type { CanvasRenderEffectRunner, CanvasRenderTarget, LensFlareEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Lens flare (PASSTHROUGH): a bright-pass-driven ghost/halo accumulation along the optical axis needs
// HDR bright sampling and per-fragment marching. Shader-only / HDR-only.
export function applyLensFlareEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LensFlareEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasLensFlareEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLensFlareEffectToCanvas(ctx.source, ctx.dest, effect as LensFlareEffect);
};
