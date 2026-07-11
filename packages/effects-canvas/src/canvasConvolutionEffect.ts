import type { CanvasRenderEffectRunner, CanvasRenderTarget, ConvolutionEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Convolution (PASSTHROUGH): a generic matrix-kernel gather is per-pixel neighbor math. No CSS filter
// equivalent, but expressible per-pixel via getImageData/putImageData; not yet implemented — passthrough
// for now.
export function applyConvolutionEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ConvolutionEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasConvolutionEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyConvolutionEffectToCanvas(ctx.source, ctx.dest, effect as ConvolutionEffect);
};
