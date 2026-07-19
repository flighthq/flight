import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  InnerGlowEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';

import { applyWgpuEffectBlitPass } from './wgpuEffectBlitShader';
import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import { clearWgpuEffectTarget } from './wgpuEffectPass';
import { applyWgpuEffectInnerClipPass, applyWgpuEffectInvertTintPass } from './wgpuEffectTintShader';

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then composite over the source.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// multi-pass recipe (invert-tint → box blur → inner clip → composite), then releases them.
export function applyInnerGlowEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<InnerGlowEffect>,
): void {
  const src = source as WgpuRenderTarget;
  const dst = dest as WgpuRenderTarget;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s1 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s2 = acquireWgpuRenderTarget(state, pool, descriptor);

  const color = effect.color ?? 0xff0000;
  const alpha = effect.alpha ?? 1;
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const knockout = effect.knockout ?? false;

  applyWgpuEffectInvertTintPass(state, src, s0, color, alpha, strength);
  applyWgpuEffectBoxBlur(state, s0, s1, s2, {
    blurX: effect.blurX ?? 6,
    blurY: effect.blurY ?? 6,
    passes: quality,
  });
  applyWgpuEffectInnerClipPass(state, s1, src, s0);

  clearWgpuEffectTarget(state, dst);
  if (!knockout) {
    applyWgpuEffectBlitPass(state, src, dst);
  }
  applyWgpuEffectBlitPass(state, s0, dst);

  releaseWgpuRenderTarget(pool, s0);
  releaseWgpuRenderTarget(pool, s1);
  releaseWgpuRenderTarget(pool, s2);
}

export const defaultWgpuInnerGlowEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyInnerGlowEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as InnerGlowEffect);
};
