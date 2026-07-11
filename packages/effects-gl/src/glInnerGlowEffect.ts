import { applyInnerGlowFilterToGl } from '@flighthq/filters-gl';
import { acquireGlRenderTarget, releaseGlRenderTarget } from '@flighthq/render-gl';
import type {
  InnerGlowEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then composite over the source.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool and
// delegates the multi-pass recipe to the shared Tier-1 filters-gl realization, then releases them.
export function applyInnerGlowEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<InnerGlowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);
  applyInnerGlowFilterToGl(state, source as GlRenderTarget, dest as GlRenderTarget, [s0, s1, s2], effect);
  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlInnerGlowEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyInnerGlowEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as InnerGlowEffect);
};
