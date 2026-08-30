import type {
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  GradientBevelEffect,
} from '@flighthq/types/contract';

import { clipCanvasBevelBand } from './canvasBevelEffect';
import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { applyCanvasGradientRampLookup, buildCanvasGradientRamp } from './canvasGradientRamp';
import {
  acquireCanvasRenderTarget,
  createCanvasRenderTargetPool,
  releaseCanvasRenderTarget,
} from './canvasRenderEffectPipeline';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';
import { clearCanvasTarget, compositeCanvasImage } from './canvasSourceModeCompositing';

// Gradient-bevel composite effect: the same lit/unlit edge band the plain bevel builds, coloured from a
// colours/alphas/ratios ramp instead of from two flat colours.
//
// The ramp is SIGNED, which is the point of the effect and the reason the two sides are looked up
// separately. GL encodes the bevel gradient into [0,1] with 0.5 as the neutral midpoint, so the shadow
// edge reads the ramp's low end and the highlight edge its high end. Here the highlight side indexes from
// the midpoint upward (bias 0.5, scale +0.5) and the shadow side from the midpoint downward
// (bias 0.5, scale -0.5), which puts each side on its own half of one ramp exactly as GL does.
//
// The band itself is built the same way as the plain bevel, and carries the same documented departure
// from GL: Canvas has no per-fragment subtraction, so each side is a knockout rather than a difference.
export function applyGradientBevelEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<GradientBevelEffect>,
): void;
export function applyGradientBevelEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<GradientBevelEffect>,
): void;
export function applyGradientBevelEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  poolOrEffect: CanvasRenderTargetPool | Readonly<GradientBevelEffect>,
  maybeEffect?: Readonly<GradientBevelEffect>,
): void {
  const effect = maybeEffect ?? (poolOrEffect as Readonly<GradientBevelEffect>);
  const pool =
    maybeEffect === undefined
      ? createCanvasRenderTargetPool(source.surface.creator)
      : (poolOrEffect as CanvasRenderTargetPool);
  applyGradientBevelEffectToCanvasWithPool(source, dest, pool, effect);
}

export const defaultCanvasGradientBevelEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyGradientBevelEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as GradientBevelEffect);
};

export function registerCanvasGradientBevelEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'GradientBevelEffect', defaultCanvasGradientBevelEffectRunner);
}

function applyGradientBevelEffectToCanvasWithPool(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<GradientBevelEffect>,
): void {
  const blurred = acquireCanvasRenderTarget(pool, source.width, source.height);
  const lit = acquireCanvasRenderTarget(pool, source.width, source.height);
  const shade = acquireCanvasRenderTarget(pool, source.width, source.height);
  const side = acquireCanvasRenderTarget(pool, source.width, source.height);
  const ramped = acquireCanvasRenderTarget(pool, source.width, source.height);
  const band = acquireCanvasRenderTarget(pool, source.width, source.height);

  const blur = Math.max(0, ((effect.blurX ?? 4) + (effect.blurY ?? 4)) / 2);
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const offsetX = Math.cos(angle) * distance;
  const offsetY = Math.sin(angle) * distance;
  const strength = Math.min(1, effect.strength ?? 1);
  const ramp = buildCanvasGradientRamp(effect.colors, effect.alphas, effect.ratios);

  drawCanvasEffectPass(blurred, source, blur > 0 ? `blur(${blur}px)` : 'none');
  clearCanvasTarget(lit);
  compositeCanvasImage(lit, blurred, -offsetX, -offsetY);
  clearCanvasTarget(shade);
  compositeCanvasImage(shade, blurred, offsetX, offsetY);

  clearCanvasTarget(band);

  // Highlight side reads the ramp upward from its midpoint.
  clearCanvasTarget(side);
  compositeCanvasImage(side, lit);
  compositeCanvasImage(side, shade, 0, 0, 'destination-out');
  applyCanvasGradientRampLookup(ramped, side, ramp, 0.5, 0.5 * strength);
  compositeCanvasImage(band, ramped);

  // Shadow side reads the same ramp downward from the midpoint, so one ramp spans both halves.
  clearCanvasTarget(side);
  compositeCanvasImage(side, shade);
  compositeCanvasImage(side, lit, 0, 0, 'destination-out');
  applyCanvasGradientRampLookup(ramped, side, ramp, 0.5, -0.5 * strength);
  compositeCanvasImage(band, ramped);

  clipCanvasBevelBand(band, source, effect.bevelType);

  clearCanvasTarget(dest);
  if ((effect.sourceMode ?? 'draw') !== 'hide') compositeCanvasImage(dest, source);
  compositeCanvasImage(dest, band);

  releaseCanvasRenderTarget(pool, band);
  releaseCanvasRenderTarget(pool, ramped);
  releaseCanvasRenderTarget(pool, side);
  releaseCanvasRenderTarget(pool, shade);
  releaseCanvasRenderTarget(pool, lit);
  releaseCanvasRenderTarget(pool, blurred);
}
