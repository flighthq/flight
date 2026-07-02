import type { CanvasRenderEffectRunner, CanvasRenderTarget, DisplacementEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Displacement / heat-haze (PASSTHROUGH): a per-pixel uv warp. No CSS filter equivalent, but expressible
// per-pixel via getImageData/putImageData; not yet implemented — passthrough for now.
export function applyDisplacementEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<DisplacementEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasDisplacementEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyDisplacementEffectToCanvas(ctx.source, ctx.dest, effect as DisplacementEffect);
};
