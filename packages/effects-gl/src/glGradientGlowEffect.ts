import { applyGradientGlowFilterToGl } from '@flighthq/filters-gl';
import { acquireGlRenderTarget, releaseGlRenderTarget } from '@flighthq/render-gl';
import type {
  GradientGlowEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

// Gradient-glow composite effect: an outer glow whose color is looked up from a colors/alphas/ratios gradient ramp indexed by the blurred silhouette alpha.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool and
// delegates the multi-pass recipe to the shared Tier-1 filters-gl realization, then releases them.
export function applyGradientGlowEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<GradientGlowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);
  applyGradientGlowFilterToGl(state, source as GlRenderTarget, dest as GlRenderTarget, [s0, s1, s2], effect);
  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlGradientGlowEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyGradientGlowEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as GradientGlowEffect);
};
