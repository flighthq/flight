import type {
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  InnerShadowEffect,
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

// Inner-shadow composite effect: tint the inverted silhouette, blur it, shift it by angle and distance,
// clip it back to the source alpha, then draw it over the source.
//
// Identical to the inner glow except for the shift, which is what gives the shadow a direction: the
// blurred inversion is offset so more of it survives the clip on one side of the shape than the other.
// The order matters and mirrors GL — blur FIRST, then offset. Offsetting the mask before blurring would
// smear the shadow symmetrically around the shifted edge and lose the directional falloff.
//
// Angle is DEGREES on this descriptor, converted here, per the SDK's authoring-layer convention.
export function applyInnerShadowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<InnerShadowEffect>,
): void;
export function applyInnerShadowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<InnerShadowEffect>,
): void;
export function applyInnerShadowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  poolOrEffect: CanvasRenderTargetPool | Readonly<InnerShadowEffect>,
  maybeEffect?: Readonly<InnerShadowEffect>,
): void {
  const effect = maybeEffect ?? (poolOrEffect as Readonly<InnerShadowEffect>);
  const pool = maybeEffect === undefined ? createCanvasRenderTargetPool() : (poolOrEffect as CanvasRenderTargetPool);
  applyInnerShadowEffectToCanvasWithPool(source, dest, pool, effect);
}

export const defaultCanvasInnerShadowEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyInnerShadowEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as InnerShadowEffect);
};

export function registerCanvasInnerShadowEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'InnerShadowEffect', defaultCanvasInnerShadowEffectRunner);
}

function applyInnerShadowEffectToCanvasWithPool(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<InnerShadowEffect>,
): void {
  const mask = acquireCanvasRenderTarget(pool, source.width, source.height);
  const blurred = acquireCanvasRenderTarget(pool, source.width, source.height);
  const shadow = acquireCanvasRenderTarget(pool, source.width, source.height);

  const strength = effect.strength ?? 1;
  const shadowPasses = Math.max(1, Math.floor(strength));
  const blur = Math.max(0, ((effect.blurX ?? 4) + (effect.blurY ?? 4)) / 2);
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const offsetX = Math.cos(angle) * distance;
  const offsetY = Math.sin(angle) * distance;

  drawCanvasInvertedTintedAlphaMask(mask, source, effect.color ?? 0x000000ff, effect.alpha ?? 1, Math.min(1, strength));
  drawCanvasEffectPass(blurred, mask, blur > 0 ? `blur(${blur}px)` : 'none');

  // The offset is its own pass into a cleared target rather than a shifted draw into `blurred`, because
  // drawing a target onto itself at an offset would read pixels it is concurrently writing.
  clearCanvasTarget(shadow);
  compositeCanvasImage(shadow, blurred, offsetX, offsetY);
  compositeCanvasImage(shadow, source, 0, 0, 'destination-in');

  clearCanvasTarget(dest);
  if ((effect.sourceMode ?? 'draw') !== 'hide') compositeCanvasImage(dest, source);
  for (let i = 0; i < shadowPasses; i++) compositeCanvasImage(dest, shadow);

  releaseCanvasRenderTarget(pool, mask);
  releaseCanvasRenderTarget(pool, blurred);
  releaseCanvasRenderTarget(pool, shadow);
}
