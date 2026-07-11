import { applyGradientGlowFilterToWgpu } from '@flighthq/filters-wgpu';
import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  GradientGlowEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';

// Gradient-glow composite effect: an outer glow whose color is looked up from a colors/alphas/ratios gradient ramp indexed by the blurred silhouette alpha.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool and
// delegates the multi-pass recipe to the shared Tier-1 filters-wgpu realization, then releases them.
export function applyGradientGlowEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<GradientGlowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s1 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s2 = acquireWgpuRenderTarget(state, pool, descriptor);
  applyGradientGlowFilterToWgpu(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, [s0, s1, s2], effect);
  releaseWgpuRenderTarget(pool, s0);
  releaseWgpuRenderTarget(pool, s1);
  releaseWgpuRenderTarget(pool, s2);
}

export const defaultWgpuGradientGlowEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyGradientGlowEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as GradientGlowEffect);
};
