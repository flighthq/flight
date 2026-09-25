import { getCanvasSurfaceHost } from '@flighthq/scene2d-canvas/contract';
import type {
  CanvasEffectRunner,
  CanvasRenderState,
  CanvasTextureRenderTarget,
  CanvasRenderTargetPool,
  OuterGlowEffect,
} from '@flighthq/types/contract';

import { drawCanvasEffectPass } from './canvasEffectCompositing.ts';
import { computeOuterGlowEffectCss } from './canvasEffectDropShadowCss.ts';
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

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then apply sourceMode compositing.
// Canvas 2D keeps the CSS `drop-shadow()` fast path for sourceMode 'draw' with isotropic blur. Source
// hide/knockout use explicit compositing because CSS drop-shadow always draws the original image too.
export function applyOuterGlowEffectToCanvas(
  source: Readonly<CanvasTextureRenderTarget>,
  dest: Readonly<CanvasTextureRenderTarget>,
  effect: Readonly<OuterGlowEffect>,
): void;
export function applyOuterGlowEffectToCanvas(
  source: Readonly<CanvasTextureRenderTarget>,
  dest: Readonly<CanvasTextureRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<OuterGlowEffect>,
): void;
export function applyOuterGlowEffectToCanvas(
  source: Readonly<CanvasTextureRenderTarget>,
  dest: Readonly<CanvasTextureRenderTarget>,
  poolOrEffect: CanvasRenderTargetPool | Readonly<OuterGlowEffect>,
  maybeEffect?: Readonly<OuterGlowEffect>,
): void {
  const effect = maybeEffect ?? (poolOrEffect as Readonly<OuterGlowEffect>);
  const css = computeOuterGlowEffectCss(effect);
  if (css !== null) {
    drawCanvasEffectPass(dest, source, css);
    return;
  }

  const pool =
    maybeEffect === undefined
      ? createCanvasTextureRenderTargetPool(getCanvasSurfaceHost(source.surface)!)
      : (poolOrEffect as CanvasRenderTargetPool);
  applyOuterGlowEffectToCanvasWithPool(source, dest, pool, effect);
}

export const canvasOuterGlowEffectRunner: CanvasEffectRunner = (ctx, effect) => {
  applyOuterGlowEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as OuterGlowEffect);
};

export function registerCanvasOuterGlowEffect(state: CanvasRenderState): void {
  registerCanvasEffect(state, 'OuterGlowEffect', canvasOuterGlowEffectRunner);
}

function applyOuterGlowEffectToCanvasWithPool(
  source: Readonly<CanvasTextureRenderTarget>,
  dest: Readonly<CanvasTextureRenderTarget>,
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

  drawCanvasTintedAlphaMask(mask, source, effect.color ?? 0xff0000ff, effect.alpha ?? 1, tintStrength);
  drawCanvasEffectPass(blurred, mask, blur > 0 ? `blur(${blur}px)` : 'none');

  clearCanvasTarget(dest);
  for (let i = 0; i < glowPasses; i++) {
    compositeCanvasImage(dest, blurred);
  }
  compositeCanvasSourceMode(dest, source, sourceMode);

  releaseCanvasRenderTarget(pool, mask);
  releaseCanvasRenderTarget(pool, blurred);
}
