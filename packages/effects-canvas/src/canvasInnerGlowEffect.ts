import type {
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  InnerGlowEffect,
} from '@flighthq/types/contract';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import {
  acquireCanvasRenderTarget,
  createCanvasRenderTargetPool,
  releaseCanvasRenderTarget,
} from './canvasRenderEffectPipeline';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';
import {
  clearCanvasTarget,
  compositeCanvasImage,
  drawCanvasInvertedTintedAlphaMask,
} from './canvasSourceModeCompositing';

// Inner-glow composite effect: tint the INVERTED silhouette, blur it inward across the boundary, clip it
// back to the source alpha, then draw it over the source.
//
// The recipe mirrors the GL pass step for step, and the inversion is the whole idea: the glow originates
// outside the shape, so blurring carries it inward from the edge and the clip discards everything that
// never made it inside. Blurring the shape's own silhouette would give an outer glow that no amount of
// clipping turns inward.
//
// There is no CSS fast path here, unlike outer glow. `drop-shadow()` blurs the silhouette outward, which
// is the effect this one is the complement of.
//
// Composite order is the mirror of the outer effects too. An outer glow lays the glow down and composites
// the source over it; an inner glow sits ON the shape, so the source goes down first and the glow over it.
export function applyInnerGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<InnerGlowEffect>,
): void;
export function applyInnerGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<InnerGlowEffect>,
): void;
export function applyInnerGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  poolOrEffect: CanvasRenderTargetPool | Readonly<InnerGlowEffect>,
  maybeEffect?: Readonly<InnerGlowEffect>,
): void {
  const effect = maybeEffect ?? (poolOrEffect as Readonly<InnerGlowEffect>);
  const pool =
    maybeEffect === undefined
      ? createCanvasRenderTargetPool(source.surface.creator)
      : (poolOrEffect as CanvasRenderTargetPool);
  applyInnerGlowEffectToCanvasWithPool(source, dest, pool, effect);
}

export const defaultCanvasInnerGlowEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyInnerGlowEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as InnerGlowEffect);
};

export function registerCanvasInnerGlowEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'InnerGlowEffect', defaultCanvasInnerGlowEffectRunner);
}

function applyInnerGlowEffectToCanvasWithPool(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<InnerGlowEffect>,
): void {
  const mask = acquireCanvasRenderTarget(pool, source.width, source.height);
  const glow = acquireCanvasRenderTarget(pool, source.width, source.height);

  const strength = effect.strength ?? 1;
  const glowPasses = Math.max(1, Math.floor(strength));
  const blur = Math.max(0, ((effect.blurX ?? 6) + (effect.blurY ?? 6)) / 2);

  drawCanvasInvertedTintedAlphaMask(mask, source, effect.color ?? 0xffffffff, effect.alpha ?? 1, Math.min(1, strength));
  drawCanvasEffectPass(glow, mask, blur > 0 ? `blur(${blur}px)` : 'none');
  // Clip to the source alpha. Without this the blurred inversion still covers the whole exterior, which
  // would paint the glow outside the shape as well as inside it.
  compositeCanvasImage(glow, source, 0, 0, 'destination-in');

  clearCanvasTarget(dest);
  // 'hide' drops the source and keeps only the glow; the type admits no 'knockout' for inner effects,
  // since knocking the shape out of an effect drawn inside it would erase the effect too.
  if ((effect.sourceMode ?? 'draw') !== 'hide') compositeCanvasImage(dest, source);
  for (let i = 0; i < glowPasses; i++) compositeCanvasImage(dest, glow);

  releaseCanvasRenderTarget(pool, mask);
  releaseCanvasRenderTarget(pool, glow);
}
