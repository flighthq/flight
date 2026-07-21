import type { CameraMotionBlurEffect, CanvasRenderEffectRunner, CanvasRenderTarget } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Camera3D motion blur (PASSTHROUGH): a zoom smear accumulating taps toward screen center.
// Genuinely unsupportable on Canvas 2D: needs camera velocity/depth reprojection the 2D context does not
// expose. Passthrough.
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
