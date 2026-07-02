import type { CanvasRenderEffectRunner, CanvasRenderTarget, SketchEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Sketch (PASSTHROUGH): luminance edge detection inverted into pencil strokes is per-pixel neighbor
// sampling. No CSS filter equivalent, but expressible per-pixel via getImageData/putImageData; not yet
// implemented — passthrough for now.
export function applySketchEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SketchEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasSketchEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySketchEffectToCanvas(ctx.source, ctx.dest, effect as SketchEffect);
};
