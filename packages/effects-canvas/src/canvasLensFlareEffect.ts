import type { CanvasRenderEffectRunner, CanvasRenderTarget, LensFlareEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Lens flare (PASSTHROUGH): a bright-pass-driven ghost/halo accumulation along the optical axis. No CSS
// filter equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented —
// passthrough for now. (Operates on already-clamped 8-bit input, so the bright-pass is approximate.)
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
