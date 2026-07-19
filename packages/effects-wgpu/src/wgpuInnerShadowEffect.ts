import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  InnerShadowEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';

import { applyWgpuEffectBlitOffsetPass, applyWgpuEffectBlitPass } from './wgpuEffectBlitShader';
import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import { clearWgpuEffectTarget } from './wgpuEffectPass';
import { applyWgpuEffectInnerClipPass, applyWgpuEffectInvertTintPass } from './wgpuEffectTintShader';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then composite over the source.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// multi-pass recipe (invert-tint → box blur → offset → inner clip → composite), then releases them.
export function applyInnerShadowEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<InnerShadowEffect>,
): void {
  const src = source as WgpuRenderTarget;
  const dst = dest as WgpuRenderTarget;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s1 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s2 = acquireWgpuRenderTarget(state, pool, descriptor);

  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const color = effect.color ?? 0;
  const alpha = effect.alpha ?? 1;
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const hideObject = effect.hideObject ?? false;
  const knockout = effect.knockout ?? false;

  applyWgpuEffectInvertTintPass(state, src, s0, color, alpha, strength);
  applyWgpuEffectBoxBlur(state, s0, s1, s2, {
    blurX: effect.blurX ?? 4,
    blurY: effect.blurY ?? 4,
    passes: quality,
  });
  applyWgpuEffectBlitOffsetPass(state, s1, s0, dx, dy);
  applyWgpuEffectInnerClipPass(state, s0, src, s1);

  clearWgpuEffectTarget(state, dst);
  if (!hideObject && !knockout) {
    applyWgpuEffectBlitPass(state, src, dst);
  }
  applyWgpuEffectBlitPass(state, s1, dst);

  releaseWgpuRenderTarget(pool, s0);
  releaseWgpuRenderTarget(pool, s1);
  releaseWgpuRenderTarget(pool, s2);
}

export const defaultWgpuInnerShadowEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyInnerShadowEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as InnerShadowEffect);
};
