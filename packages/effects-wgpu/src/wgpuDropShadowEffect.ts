import { getColorAlpha, getColorRgb } from '@flighthq/color/contract';
import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu/contract';
import type {
  DropShadowEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types/contract';

import {
  applyWgpuEffectBlitOffsetPass,
  applyWgpuEffectBlitPass,
  applyWgpuEffectErasePass,
} from './wgpuEffectBlitShader';
import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import { clearWgpuEffectTarget } from './wgpuEffectPass';
import { applyWgpuEffectTintPass } from './wgpuEffectTintShader';
import { registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then apply sourceMode compositing.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// multi-pass recipe (tint → box blur → offset → composite), then releases them.
export function applyDropShadowEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<DropShadowEffect>,
): void {
  const src = source as WgpuRenderTarget;
  const dst = dest as WgpuRenderTarget;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const mask = acquireWgpuRenderTarget(state, pool, descriptor);
  const blurred = acquireWgpuRenderTarget(state, pool, descriptor);
  const blurTemp = acquireWgpuRenderTarget(state, pool, descriptor);

  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  // Packed RGBA, matching BitmapDropShadowOptions.color offscreen. The shared tint pass takes RGB plus
  // one alpha and is used by effects that have not migrated, so the split happens here, not in the pass.
  const packed = effect.color ?? 0x000000ff;
  const color = getColorRgb(packed);
  const alpha = (effect.alpha ?? 1) * getColorAlpha(packed);
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const sourceMode = effect.sourceMode ?? 'draw';

  const tintStrength = Math.min(1, strength);
  const shadowPasses = Math.max(1, Math.floor(strength));

  applyWgpuEffectTintPass(state, src, mask, color, alpha, tintStrength);
  applyWgpuEffectBoxBlur(state, mask, blurred, blurTemp, {
    blurX: effect.blurX ?? 4,
    blurY: effect.blurY ?? 4,
    passes: quality,
  });

  clearWgpuEffectTarget(state, dst);
  for (let i = 0; i < shadowPasses; i++) {
    applyWgpuEffectBlitOffsetPass(state, blurred, dst, dx, dy);
  }

  if (sourceMode === 'knockout') {
    applyWgpuEffectErasePass(state, src, dst);
  } else if (sourceMode === 'draw') {
    applyWgpuEffectBlitPass(state, src, dst);
  }

  releaseWgpuRenderTarget(pool, mask);
  releaseWgpuRenderTarget(pool, blurred);
  releaseWgpuRenderTarget(pool, blurTemp);
}

export const defaultWgpuDropShadowEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyDropShadowEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as DropShadowEffect);
};

export function registerWgpuDropShadowEffect(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'DropShadowEffect', defaultWgpuDropShadowEffectRunner);
}
