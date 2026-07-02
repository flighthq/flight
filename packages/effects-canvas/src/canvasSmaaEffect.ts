import type { CanvasRenderEffectRunner, CanvasRenderTarget, SmaaEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// SMAA (PASSTHROUGH): edge-aware blend weights against lookup textures are per-pixel neighbor work. No
// CSS filter equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented —
// passthrough for now.
export function applySmaaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SmaaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasSmaaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySmaaEffectToCanvas(ctx.source, ctx.dest, effect as SmaaEffect);
};
