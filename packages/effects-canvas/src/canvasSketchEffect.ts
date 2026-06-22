import type { CanvasRenderEffectRunner, CanvasRenderTarget, SketchEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Sketch (PASSTHROUGH): luminance edge detection inverted into pencil strokes is a per-pixel
// neighbor-sampling shader with no 2D draw-op path. Shader-only.
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
