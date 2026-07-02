import type { CanvasRenderEffectRunner, CanvasRenderTarget, LensDistortionEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Lens distortion (PASSTHROUGH): a radial uv remap (barrel/pincushion). No CSS filter equivalent, but
// expressible per-pixel via getImageData/putImageData; not yet implemented — passthrough for now.
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
