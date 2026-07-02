import type { CanvasRenderEffectRunner, CanvasRenderTarget, LookupTableGradeEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// LUT grade (PASSTHROUGH): sampling a 3D LUT cube per pixel. No CSS filter equivalent, but expressible
// per-pixel via getImageData/putImageData; not yet implemented — passthrough for now.
export function applyLookupTableGradeEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LookupTableGradeEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasLookupTableGradeEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLookupTableGradeEffectToCanvas(ctx.source, ctx.dest, effect as LookupTableGradeEffect);
};
