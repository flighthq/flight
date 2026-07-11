import { applyInnerGlowFilterToWgpu } from '@flighthq/filters-wgpu';
import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  InnerGlowEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then composite over the source.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool and
// delegates the multi-pass recipe to the shared Tier-1 filters-wgpu realization, then releases them.
export function applyInnerGlowEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<InnerGlowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s1 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s2 = acquireWgpuRenderTarget(state, pool, descriptor);
  applyInnerGlowFilterToWgpu(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, [s0, s1, s2], effect);
  releaseWgpuRenderTarget(pool, s0);
  releaseWgpuRenderTarget(pool, s1);
  releaseWgpuRenderTarget(pool, s2);
}

export const defaultWgpuInnerGlowEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyInnerGlowEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as InnerGlowEffect);
};
