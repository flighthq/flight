import type { CanvasRenderEffectRunner, CanvasRenderTarget, ToneMapEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Tone map (PASSTHROUGH): tone-mapping operators compress HDR linear light to displayable range. No CSS
// filter equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented —
// passthrough for now. (The Canvas source is already clamped 8-bit with little HDR to compress, so the
// result is approximate.)
export function applyToneMapEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ToneMapEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasToneMapEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyToneMapEffectToCanvas(ctx.source, ctx.dest, effect as ToneMapEffect);
};
