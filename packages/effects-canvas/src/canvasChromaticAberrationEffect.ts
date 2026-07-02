import type { CanvasRenderEffectRunner, CanvasRenderTarget, ChromaticAberrationEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Chromatic aberration (PASSTHROUGH): splitting R/G/B channels at offset positions, which a 2D drawImage
// cannot address. No CSS filter equivalent, but expressible per-pixel via getImageData/putImageData; not
// yet implemented — passthrough for now.
export function applyChromaticAberrationEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ChromaticAberrationEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasChromaticAberrationEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyChromaticAberrationEffectToCanvas(ctx.source, ctx.dest, effect as ChromaticAberrationEffect);
};
