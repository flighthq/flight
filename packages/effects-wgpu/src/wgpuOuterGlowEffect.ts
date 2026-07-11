import { applyOuterGlowFilterToWgpu } from '@flighthq/filters-wgpu';
import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  OuterGlowEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then composite the source over the glow.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool and
// delegates the multi-pass recipe to the shared Tier-1 filters-wgpu realization, then releases them.
export function applyOuterGlowEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<OuterGlowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s1 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s2 = acquireWgpuRenderTarget(state, pool, descriptor);
  applyOuterGlowFilterToWgpu(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, [s0, s1, s2], effect);
  releaseWgpuRenderTarget(pool, s0);
  releaseWgpuRenderTarget(pool, s1);
  releaseWgpuRenderTarget(pool, s2);
}

export const defaultWgpuOuterGlowEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyOuterGlowEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as OuterGlowEffect);
};
