import { applyInnerShadowFilterToGl } from '@flighthq/filters-gl';
import { acquireGlRenderTarget, releaseGlRenderTarget } from '@flighthq/render-gl';
import type {
  InnerShadowEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then composite over the source.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool and
// delegates the multi-pass recipe to the shared Tier-1 filters-gl realization, then releases them.
export function applyInnerShadowEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<InnerShadowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);
  applyInnerShadowFilterToGl(state, source as GlRenderTarget, dest as GlRenderTarget, [s0, s1, s2], effect);
  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlInnerShadowEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyInnerShadowEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as InnerShadowEffect);
};
