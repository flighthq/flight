import type {
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  DropShadowEffect,
} from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { computeDropShadowEffectCss } from './canvasEffectDropShadowCss';
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

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then apply sourceMode compositing.
// Canvas 2D keeps the CSS `drop-shadow()` fast path for sourceMode 'draw' with isotropic blur. Source
// hide/knockout use explicit compositing because CSS drop-shadow always draws the original image too.
export function applyDropShadowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<DropShadowEffect>,
): void;
export function applyDropShadowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<DropShadowEffect>,
): void;
export function applyDropShadowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  poolOrEffect: CanvasRenderTargetPool | Readonly<DropShadowEffect>,
  maybeEffect?: Readonly<DropShadowEffect>,
): void {
  const effect = maybeEffect ?? (poolOrEffect as Readonly<DropShadowEffect>);
  const css = computeDropShadowEffectCss(effect);
  if (css !== null) {
    drawCanvasEffectPass(dest, source, css);
    return;
  }

  const pool = maybeEffect === undefined ? createCanvasRenderTargetPool() : (poolOrEffect as CanvasRenderTargetPool);
  applyDropShadowEffectToCanvasWithPool(source, dest, pool, effect);
}

export const defaultCanvasDropShadowEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyDropShadowEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as DropShadowEffect);
};

function applyDropShadowEffectToCanvasWithPool(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<DropShadowEffect>,
): void {
  const mask = acquireCanvasRenderTarget(pool, source.width, source.height);
  const blurred = acquireCanvasRenderTarget(pool, source.width, source.height);

  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const strength = effect.strength ?? 1;
  const tintStrength = Math.min(1, strength);
  const shadowPasses = Math.max(1, Math.floor(strength));
  const blur = Math.max(0, ((effect.blurX ?? 4) + (effect.blurY ?? 4)) / 2);
  const sourceMode = effect.sourceMode ?? 'draw';

  drawCanvasTintedAlphaMask(mask, source, effect.color ?? 0, effect.alpha ?? 1, tintStrength);
  drawCanvasEffectPass(blurred, mask, blur > 0 ? `blur(${blur}px)` : 'none');

  clearCanvasTarget(dest);
  for (let i = 0; i < shadowPasses; i++) {
    compositeCanvasImage(dest, blurred, dx, dy);
  }
  compositeCanvasSourceMode(dest, source, sourceMode);

  releaseCanvasRenderTarget(pool, mask);
  releaseCanvasRenderTarget(pool, blurred);
}
