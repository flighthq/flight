import { acquireGlRenderTarget, clearGlRenderTarget, releaseGlRenderTarget } from '@flighthq/render-gl';
import type {
  OuterGlowEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

import { applyGlEffectBlitPass, applyGlEffectErasePass } from './glEffectBlitShader';
import { applyGlEffectBoxBlur } from './glEffectBoxBlur';
import { applyGlEffectTintPass } from './glEffectTintShader';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then composite the source over the glow.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// inlined multi-pass recipe, then releases them.
//
// Compositing order depends on `sourceMode`: 'draw' composites glow → source, 'hide' composites glow
// only, and 'knockout' composites glow then erases the source silhouette.
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

  const src = source as GlRenderTarget;
  const dst = dest as GlRenderTarget;

  const color = effect.color ?? 0xff0000;
  const alpha = effect.alpha ?? 1;
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const sourceMode = effect.sourceMode ?? 'draw';

  const tintStrength = Math.min(1, strength);
  const glowPasses = Math.max(1, Math.floor(strength));

  const [mask, blurred, blurTemp] = [s0, s1, s2];

  applyGlEffectTintPass(state, src, mask, color, alpha, tintStrength);
  applyGlEffectBoxBlur(state, mask, blurred, blurTemp, {
    blurX: effect.blurX ?? 6,
    blurY: effect.blurY ?? 6,
    passes: quality,
  });

  clearGlRenderTarget(state, dst);
  for (let i = 0; i < glowPasses; i++) {
    applyGlEffectBlitPass(state, blurred, dst);
  }

  if (sourceMode === 'knockout') {
    applyGlEffectErasePass(state, src, dst);
  } else if (sourceMode === 'draw') {
    applyGlEffectBlitPass(state, src, dst);
  }

  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlOuterGlowEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyOuterGlowEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as OuterGlowEffect);
};
