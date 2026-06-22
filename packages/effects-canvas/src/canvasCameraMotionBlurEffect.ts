import type { CameraMotionBlurEffect, CanvasRenderEffectRunner, CanvasRenderTarget } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Camera motion blur (PASSTHROUGH): a zoom smear accumulating taps toward screen center is a per-pixel
// multi-tap gather with no 2D draw-op path. Shader-only.
export function applyCameraMotionBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<CameraMotionBlurEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasCameraMotionBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyCameraMotionBlurEffectToCanvas(ctx.source, ctx.dest, effect as CameraMotionBlurEffect);
};
