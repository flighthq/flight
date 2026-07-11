import { applyOuterGlowFilterToGl } from '@flighthq/filters-gl';
import { acquireGlRenderTarget, releaseGlRenderTarget } from '@flighthq/render-gl';
import type {
  OuterGlowEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then composite the source over the glow.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool and
// delegates the multi-pass recipe to the shared Tier-1 filters-gl realization, then releases them.
export function applyOuterGlowEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<OuterGlowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);
  applyOuterGlowFilterToGl(state, source as GlRenderTarget, dest as GlRenderTarget, [s0, s1, s2], effect);
  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlOuterGlowEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyOuterGlowEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as OuterGlowEffect);
};
