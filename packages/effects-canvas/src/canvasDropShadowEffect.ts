import { getCanvasSurfaceHost } from '@flighthq/scene2d-canvas/contract';
import type {
  CanvasEffectRunner,
  CanvasRenderState,
  CanvasTextureRenderTarget,
  CanvasRenderTargetPool,
  DropShadowEffect,
} from '@flighthq/types/contract';

import { drawCanvasEffectPass } from './canvasEffectCompositing.ts';
import { computeDropShadowEffectCss } from './canvasEffectDropShadowCss.ts';
import { registerCanvasEffect } from './canvasEffectRegistry.ts';
import {
  acquireCanvasRenderTarget,
  createCanvasTextureRenderTargetPool,
  releaseCanvasRenderTarget,
} from './canvasEffectState.ts';
import {
  clearCanvasTarget,
  compositeCanvasImage,
  compositeCanvasSourceMode,
  drawCanvasTintedAlphaMask,
} from './canvasSourceModeCompositing.ts';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then apply sourceMode compositing.
// Canvas 2D keeps the CSS `drop-shadow()` fast path for sourceMode 'draw' with isotropic blur. Source
// hide/knockout use explicit compositing because CSS drop-shadow always draws the original image too.
export function applyDropShadowEffectToCanvas(
  source: Readonly<CanvasTextureRenderTarget>,
  dest: Readonly<CanvasTextureRenderTarget>,
  effect: Readonly<DropShadowEffect>,
): void;
export function applyDropShadowEffectToCanvas(
  source: Readonly<CanvasTextureRenderTarget>,
  dest: Readonly<CanvasTextureRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<DropShadowEffect>,
): void;
export function applyDropShadowEffectToCanvas(
  source: Readonly<CanvasTextureRenderTarget>,
  dest: Readonly<CanvasTextureRenderTarget>,
  poolOrEffect: CanvasRenderTargetPool | Readonly<DropShadowEffect>,
  maybeEffect?: Readonly<DropShadowEffect>,
): void {
  const effect = maybeEffect ?? (poolOrEffect as Readonly<DropShadowEffect>);
  const css = computeDropShadowEffectCss(effect);
  if (css !== null) {
    drawCanvasEffectPass(dest, source, css);
    return;
  }

  const pool =
    maybeEffect === undefined
      ? createCanvasTextureRenderTargetPool(getCanvasSurfaceHost(source.surface)!)
      : (poolOrEffect as CanvasRenderTargetPool);
  applyDropShadowEffectToCanvasWithPool(source, dest, pool, effect);
}

export const canvasDropShadowEffectRunner: CanvasEffectRunner = (ctx, effect) => {
  applyDropShadowEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as DropShadowEffect);
};

export function registerCanvasDropShadowEffect(state: CanvasRenderState): void {
  registerCanvasEffect(state, 'DropShadowEffect', canvasDropShadowEffectRunner);
}

function applyDropShadowEffectToCanvasWithPool(
  source: Readonly<CanvasTextureRenderTarget>,
  dest: Readonly<CanvasTextureRenderTarget>,
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

  drawCanvasTintedAlphaMask(mask, source, effect.color ?? 0x000000ff, effect.alpha ?? 1, tintStrength);
  drawCanvasEffectPass(blurred, mask, blur > 0 ? `blur(${blur}px)` : 'none');

  clearCanvasTarget(dest);
  for (let i = 0; i < shadowPasses; i++) {
    compositeCanvasImage(dest, blurred, dx, dy);
  }
  compositeCanvasSourceMode(dest, source, sourceMode);

  releaseCanvasRenderTarget(pool, mask);
  releaseCanvasRenderTarget(pool, blurred);
}
