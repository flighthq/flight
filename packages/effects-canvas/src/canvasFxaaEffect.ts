import type { CanvasRenderEffectRunner, CanvasRenderTarget, FxaaEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// FXAA (PASSTHROUGH): luminance edge detection + directional blend is per-pixel neighbor sampling. No
// CSS filter equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented —
// passthrough for now.
export function applyFxaaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<FxaaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasFxaaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyFxaaEffectToCanvas(ctx.source, ctx.dest, effect as FxaaEffect);
};
