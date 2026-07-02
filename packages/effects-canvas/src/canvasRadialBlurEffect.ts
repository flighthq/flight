import type { CanvasRenderEffectRunner, CanvasRenderTarget, RadialBlurEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Radial blur (PASSTHROUGH): accumulating taps toward a center point is a per-pixel multi-tap gather. No
// CSS filter equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented —
// passthrough for now.
export function applyRadialBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<RadialBlurEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasRadialBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyRadialBlurEffectToCanvas(ctx.source, ctx.dest, effect as RadialBlurEffect);
};
