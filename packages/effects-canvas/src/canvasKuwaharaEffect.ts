import type { CanvasRenderEffectRunner, CanvasRenderTarget, KuwaharaEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Kuwahara (PASSTHROUGH): edge-preserving quadrant variance smoothing is a per-pixel neighborhood
// shader with no CSS/draw-op equivalent. Shader-only.
export function applyKuwaharaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<KuwaharaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasKuwaharaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyKuwaharaEffectToCanvas(ctx.source, ctx.dest, effect as KuwaharaEffect);
};
