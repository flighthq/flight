import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  InnerGlowEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { getGaussianRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then draw or hide the source.
export function createInnerGlowEffect(
  options: Readonly<Omit<EntityWithoutRuntime<InnerGlowEffect>, 'kind'>> = {},
): InnerGlowEffect {
  const out = allocateEntity<InnerGlowEffect>();
  initializeInnerGlowEffect(out, options);
  return finishEntity(out);
}

export function getInnerGlowEffectPadding(effect: Readonly<InnerGlowEffect>): RenderEffectPadding {
  return getGaussianRenderEffectPadding(effect.blurX ?? 6, effect.blurY ?? 6);
}

export function initializeInnerGlowEffect(
  out: EntityConstruction<InnerGlowEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<InnerGlowEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'InnerGlowEffect');
  out.alpha = options.alpha;
  out.blurX = options.blurX;
  out.blurY = options.blurY;
  out.color = options.color;
  out.quality = options.quality;
  out.sourceMode = options.sourceMode;
  out.strength = options.strength;
}

export function registerInnerGlowEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'InnerGlowEffect', resolveInnerGlowEffectPadding);
}

function resolveInnerGlowEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getInnerGlowEffectPadding(effect as Readonly<InnerGlowEffect>);
}
