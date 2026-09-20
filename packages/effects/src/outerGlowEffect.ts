import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  OuterGlowEffect,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect';
import { getGaussianEffectPadding, registerEffectPaddingResolver } from './effectPadding';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then apply sourceMode compositing.
export function createOuterGlowEffect(
  options: Readonly<Omit<EntityWithoutRuntime<OuterGlowEffect>, 'kind'>> = {},
): OuterGlowEffect {
  const out = allocateEntity<OuterGlowEffect>();
  initializeOuterGlowEffect(out, options);
  return finishEntity(out);
}

export function getOuterGlowEffectPadding(effect: Readonly<OuterGlowEffect>): EffectPadding {
  return getGaussianEffectPadding(effect.blurX ?? 6, effect.blurY ?? 6);
}

export function initializeOuterGlowEffect(
  out: EntityConstruction<OuterGlowEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<OuterGlowEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'OuterGlowEffect');
  out.alpha = options.alpha;
  out.blurX = options.blurX;
  out.blurY = options.blurY;
  out.color = options.color;
  out.quality = options.quality;
  out.sourceMode = options.sourceMode;
  out.strength = options.strength;
}

export function registerOuterGlowEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'OuterGlowEffect', resolveOuterGlowEffectPadding);
}

function resolveOuterGlowEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getOuterGlowEffectPadding(effect as Readonly<OuterGlowEffect>);
}
