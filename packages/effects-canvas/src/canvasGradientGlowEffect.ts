import type {
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  GradientGlowEffect,
} from '@flighthq/types/contract';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { applyCanvasGradientRampLookup, buildCanvasGradientRamp } from './canvasGradientRamp';
import {
  acquireCanvasRenderTarget,
  createCanvasRenderTargetPool,
  releaseCanvasRenderTarget,
} from './canvasRenderEffectPipeline';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';
import { clearCanvasTarget, compositeCanvasImage } from './canvasSourceModeCompositing';

// Gradient-glow composite effect: blur the silhouette, then colour every pixel by looking its blurred
// alpha up in a colours/alphas/ratios ramp, and composite the result under the source.
//
// The lookup is what makes this a gradient GLOW rather than a tinted one: the ramp is indexed by the
// blurred alpha, so the colour sweeps along the ramp as the glow falls off with distance from the edge —
// the ramp's low end paints the faint outer fringe and its high end the bright rim. See canvasGradientRamp
// for why that cannot be a CSS gradient.
export function applyGradientGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<GradientGlowEffect>,
): void;
export function applyGradientGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<GradientGlowEffect>,
): void;
export function applyGradientGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  poolOrEffect: CanvasRenderTargetPool | Readonly<GradientGlowEffect>,
  maybeEffect?: Readonly<GradientGlowEffect>,
): void {
  const effect = maybeEffect ?? (poolOrEffect as Readonly<GradientGlowEffect>);
  const pool =
    maybeEffect === undefined
      ? createCanvasRenderTargetPool(source.surface.creator)
      : (poolOrEffect as CanvasRenderTargetPool);
  applyGradientGlowEffectToCanvasWithPool(source, dest, pool, effect);
}

export const defaultCanvasGradientGlowEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyGradientGlowEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as GradientGlowEffect);
};

export function registerCanvasGradientGlowEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'GradientGlowEffect', defaultCanvasGradientGlowEffectRunner);
}

function applyGradientGlowEffectToCanvasWithPool(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<GradientGlowEffect>,
): void {
  const blurred = acquireCanvasRenderTarget(pool, source.width, source.height);
  const glow = acquireCanvasRenderTarget(pool, source.width, source.height);

  const strength = effect.strength ?? 1;
  const glowPasses = Math.max(1, Math.floor(strength));
  const blur = Math.max(0, ((effect.blurX ?? 6) + (effect.blurY ?? 6)) / 2);
  const ramp = buildCanvasGradientRamp(effect.colors, effect.alphas, effect.ratios);

  drawCanvasEffectPass(blurred, source, blur > 0 ? `blur(${blur}px)` : 'none');
  applyCanvasGradientRampLookup(glow, blurred, ramp);

  clearCanvasTarget(dest);
  // The glow goes down FIRST and the source over it — this is an outer effect, so the shape occludes the
  // part of the glow that falls under it.
  for (let i = 0; i < glowPasses; i++) compositeCanvasImage(dest, glow);
  if ((effect.sourceMode ?? 'draw') !== 'hide') compositeCanvasImage(dest, source);

  releaseCanvasRenderTarget(pool, glow);
  releaseCanvasRenderTarget(pool, blurred);
}
