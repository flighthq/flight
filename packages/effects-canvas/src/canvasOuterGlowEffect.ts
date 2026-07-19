import type {
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  OuterGlowEffect,
} from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { computeOuterGlowEffectCss } from './canvasEffectDropShadowCss';
import {
  acquireCanvasRenderTarget,
  createCanvasRenderTargetPool,
  releaseCanvasRenderTarget,
} from './canvasRenderEffectPipeline';
import {
  clearCanvasTarget,
  compositeCanvasImage,
  compositeCanvasSourceMode,
  drawCanvasTintedAlphaMask,
} from './canvasSourceModeCompositing';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then apply sourceMode compositing.
// Canvas 2D keeps the CSS `drop-shadow()` fast path for sourceMode 'draw' with isotropic blur. Source
// hide/knockout use explicit compositing because CSS drop-shadow always draws the original image too.
export function applyOuterGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<OuterGlowEffect>,
): void;
export function applyOuterGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<OuterGlowEffect>,
): void;
export function applyOuterGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  poolOrEffect: CanvasRenderTargetPool | Readonly<OuterGlowEffect>,
  maybeEffect?: Readonly<OuterGlowEffect>,
): void {
  const effect = maybeEffect ?? (poolOrEffect as Readonly<OuterGlowEffect>);
  const css = computeOuterGlowEffectCss(effect);
  if (css !== null) {
    drawCanvasEffectPass(dest, source, css);
    return;
  }

  const pool = maybeEffect === undefined ? createCanvasRenderTargetPool() : (poolOrEffect as CanvasRenderTargetPool);
  applyOuterGlowEffectToCanvasWithPool(source, dest, pool, effect);
}

export const defaultCanvasOuterGlowEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyOuterGlowEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as OuterGlowEffect);
};

function applyOuterGlowEffectToCanvasWithPool(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<OuterGlowEffect>,
): void {
  const mask = acquireCanvasRenderTarget(pool, source.width, source.height);
  const blurred = acquireCanvasRenderTarget(pool, source.width, source.height);

  const strength = effect.strength ?? 1;
  const tintStrength = Math.min(1, strength);
  const glowPasses = Math.max(1, Math.floor(strength));
  const blur = Math.max(0, ((effect.blurX ?? 6) + (effect.blurY ?? 6)) / 2);
  const sourceMode = effect.sourceMode ?? 'draw';

  drawCanvasTintedAlphaMask(mask, source, effect.color ?? 0xff0000, effect.alpha ?? 1, tintStrength);
  drawCanvasEffectPass(blurred, mask, blur > 0 ? `blur(${blur}px)` : 'none');

  clearCanvasTarget(dest);
  for (let i = 0; i < glowPasses; i++) {
    compositeCanvasImage(dest, blurred);
  }
  compositeCanvasSourceMode(dest, source, sourceMode);

  releaseCanvasRenderTarget(pool, mask);
  releaseCanvasRenderTarget(pool, blurred);
}
