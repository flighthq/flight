import type { CanvasRenderEffectRunner, CanvasRenderTarget, GodRaysEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// God rays (PASSTHROUGH): radial light scattering marches taps from each fragment toward a light
// position — a per-pixel multi-tap gather. No CSS filter equivalent, but expressible per-pixel via
// getImageData/putImageData; not yet implemented — passthrough for now.
export function applyGodRaysEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<GodRaysEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasGodRaysEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyGodRaysEffectToCanvas(ctx.source, ctx.dest, effect as GodRaysEffect);
};
