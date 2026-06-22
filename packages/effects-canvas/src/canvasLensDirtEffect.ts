import type { CanvasRenderEffectRunner, CanvasRenderTarget, LensDirtEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Lens dirt (PASSTHROUGH): procedural per-pixel smudge blobs gated by scene brightness have no 2D
// draw-op equivalent. Shader-only.
export function applyLensDirtEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LensDirtEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasLensDirtEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLensDirtEffectToCanvas(ctx.source, ctx.dest, effect as LensDirtEffect);
};
