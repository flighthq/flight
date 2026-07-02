import type { CanvasRenderEffectRunner, CanvasRenderTarget, GlitchEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Glitch (PASSTHROUGH): per-pixel RGB channel separation and hashed block tears (like
// chromaticAberration). No CSS filter equivalent, but expressible per-pixel via getImageData/putImageData;
// not yet implemented — passthrough for now.
export function applyGlitchEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<GlitchEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasGlitchEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyGlitchEffectToCanvas(ctx.source, ctx.dest, effect as GlitchEffect);
};
