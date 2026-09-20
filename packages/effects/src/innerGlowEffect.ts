import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  InnerGlowEffect,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect';
import { getGaussianEffectPadding, registerEffectPaddingResolver } from './effectPadding';

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then draw or hide the source.
export function createInnerGlowEffect(
  options: Readonly<Omit<EntityWithoutRuntime<InnerGlowEffect>, 'kind'>> = {},
): InnerGlowEffect {
  const out = allocateEntity<InnerGlowEffect>();
  initializeInnerGlowEffect(out, options);
  return finishEntity(out);
}

export function getInnerGlowEffectPadding(effect: Readonly<InnerGlowEffect>): EffectPadding {
  return getGaussianEffectPadding(effect.blurX ?? 6, effect.blurY ?? 6);
}

export function initializeInnerGlowEffect(
  out: EntityConstruction<InnerGlowEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<InnerGlowEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'InnerGlowEffect');
  out.alpha = options.alpha;
  out.blurX = options.blurX;
  out.blurY = options.blurY;
  out.color = options.color;
  out.quality = options.quality;
  out.sourceMode = options.sourceMode;
  out.strength = options.strength;
}

export function registerInnerGlowEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'InnerGlowEffect', resolveInnerGlowEffectPadding);
}

function resolveInnerGlowEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getInnerGlowEffectPadding(effect as Readonly<InnerGlowEffect>);
}
