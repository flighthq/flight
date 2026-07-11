import { acquireGlRenderTarget, clearGlRenderTarget, releaseGlRenderTarget } from '@flighthq/render-gl';
import type {
  DropShadowEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

import { applyGlEffectBlitOffsetPass, applyGlEffectBlitPass } from './glEffectBlitShader';
import { applyGlEffectBoxBlur } from './glEffectBoxBlur';
import { applyGlEffectTintPass } from './glEffectTintShader';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then composite the source over the shadow.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// inlined multi-pass recipe, then releases them.
//
// Compositing order: shadow at offset → source (unless `hideObject` is true).
// `knockout` and `hideObject` both composite the shadow alone, omitting the source object.
export function applyDropShadowEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<DropShadowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);

  const src = source as GlRenderTarget;
  const dst = dest as GlRenderTarget;

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

  const tintStrength = Math.min(1, strength);
  const shadowPasses = Math.max(1, Math.floor(strength));

  const [mask, blurred, blurTemp] = [s0, s1, s2];

  applyGlEffectTintPass(state, src, mask, color, alpha, tintStrength);
  applyGlEffectBoxBlur(state, mask, blurred, blurTemp, {
    blurX: effect.blurX ?? 4,
    blurY: effect.blurY ?? 4,
    passes: quality,
  });

  clearGlRenderTarget(state, dst);
  for (let i = 0; i < shadowPasses; i++) {
    applyGlEffectBlitOffsetPass(state, blurred, dst, dx, dy);
  }

  if (!hideObject && !knockout) {
    applyGlEffectBlitPass(state, src, dst);
  }

  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlDropShadowEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyDropShadowEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as DropShadowEffect);
};
