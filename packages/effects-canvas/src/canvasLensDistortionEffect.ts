import type { CanvasRenderEffectRunner, CanvasRenderTarget, LensDistortionEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Lens distortion (PASSTHROUGH): a radial uv remap (barrel/pincushion) has no 2D draw-op equivalent.
// Shader-only.
export function applyLensDistortionEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LensDistortionEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasLensDistortionEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLensDistortionEffectToCanvas(ctx.source, ctx.dest, effect as LensDistortionEffect);
};
