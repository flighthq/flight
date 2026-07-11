import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  OuterGlowEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';

import { applyWgpuEffectBlitPass } from './wgpuEffectBlitShader';
import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import { clearWgpuEffectTarget } from './wgpuEffectPass';
import { applyWgpuEffectTintPass } from './wgpuEffectTintShader';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then composite the source over the glow.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// multi-pass recipe (tint → box blur → composite), then releases them.
export function applyOuterGlowEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<OuterGlowEffect>,
): void {
  const src = source as WgpuRenderTarget;
  const dst = dest as WgpuRenderTarget;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const mask = acquireWgpuRenderTarget(state, pool, descriptor);
  const blurred = acquireWgpuRenderTarget(state, pool, descriptor);
  const blurTemp = acquireWgpuRenderTarget(state, pool, descriptor);

  const color = effect.color ?? 0xff0000;
  const alpha = effect.alpha ?? 1;
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const knockout = effect.knockout ?? false;

  const tintStrength = Math.min(1, strength);
  const glowPasses = Math.max(1, Math.floor(strength));

  applyWgpuEffectTintPass(state, src, mask, color, alpha, tintStrength);
  applyWgpuEffectBoxBlur(state, mask, blurred, blurTemp, {
    blurX: effect.blurX ?? 6,
    blurY: effect.blurY ?? 6,
    passes: quality,
  });

  clearWgpuEffectTarget(state, dst);
  for (let i = 0; i < glowPasses; i++) {
    applyWgpuEffectBlitPass(state, blurred, dst);
  }

  if (!knockout) {
    applyWgpuEffectBlitPass(state, src, dst);
  }

  releaseWgpuRenderTarget(pool, mask);
  releaseWgpuRenderTarget(pool, blurred);
  releaseWgpuRenderTarget(pool, blurTemp);
}

export const defaultWgpuOuterGlowEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyOuterGlowEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as OuterGlowEffect);
};
