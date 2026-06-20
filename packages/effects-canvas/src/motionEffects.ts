import type {
  CameraMotionBlurEffect,
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
  DirectionalBlurEffect,
  MotionBlurEffect,
  RadialBlurEffect,
} from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Motion-blur recipes on Canvas 2D. All four accumulate many directional taps per pixel (radial, zoom,
// directional, or velocity-driven smears) — a multi-tap gather the CSS-filter / single drawImage path
// cannot express — so each ships as a passthrough copy for parity. Per-object motion blur additionally
// needs the scene velocity buffer, which Canvas 2D does not produce.

// Camera motion blur (PASSTHROUGH): a zoom smear accumulating taps toward screen center is a per-pixel
// multi-tap gather with no 2D draw-op path. Shader-only.
export function applyCameraMotionBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<CameraMotionBlurEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Directional blur (PASSTHROUGH): accumulating taps stepped along an angle is a per-pixel multi-tap
// gather with no 2D draw-op path. Shader-only.
export function applyDirectionalBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<DirectionalBlurEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Motion blur (PASSTHROUGH): per-object smearing reads a per-pixel velocity buffer Canvas 2D never
// writes, and accumulates taps along each fragment's vector. Shader-only / velocity-only.
export function applyMotionBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<MotionBlurEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Radial blur (PASSTHROUGH): accumulating taps toward a center point is a per-pixel multi-tap gather
// with no 2D draw-op path. Shader-only.
export function applyRadialBlurEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<RadialBlurEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasCameraMotionBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyCameraMotionBlurEffectToCanvas(ctx.source, ctx.dest, effect as CameraMotionBlurEffect);
};

export const defaultCanvasDirectionalBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyDirectionalBlurEffectToCanvas(ctx.source, ctx.dest, effect as DirectionalBlurEffect);
};

export const defaultCanvasMotionBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyMotionBlurEffectToCanvas(ctx.source, ctx.dest, effect as MotionBlurEffect);
};

export const defaultCanvasRadialBlurEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyRadialBlurEffectToCanvas(ctx.source, ctx.dest, effect as RadialBlurEffect);
};
