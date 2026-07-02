import type { CanvasRenderEffectRunner, CanvasRenderTarget, CrtEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// CRT (PASSTHROUGH): barrel distortion + channel split + scanlines + vignette as one pass. No CSS filter
// equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented — passthrough
// for now. (Scanlines alone is realized separately by applyScanlinesEffectToCanvas.)
export function applyCrtEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<CrtEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasCrtEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyCrtEffectToCanvas(ctx.source, ctx.dest, effect as CrtEffect);
};
