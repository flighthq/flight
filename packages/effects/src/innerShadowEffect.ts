import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';
import type { RenderState } from '@flighthq/render/contract';
import type { EffectPadding } from '@flighthq/render/contract';

import { initializeEffect } from './effect.ts';
import { getDirectionalEffectPadding, registerEffectPaddingResolver } from './effectPadding.ts';
import type { Effect } from './types.ts';
import type { InnerShadowEffect } from './types/InnerShadowEffect.ts';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then draw or hide the source.
export function createInnerShadowEffect(
  options: Readonly<Omit<EntityWithoutRuntime<InnerShadowEffect>, 'kind'>> = {},
): InnerShadowEffect {
  const out = allocateEntity<InnerShadowEffect>();
  initializeInnerShadowEffect(out, options);
  return out;
}

export function getInnerShadowEffectPadding(effect: Readonly<InnerShadowEffect>): EffectPadding {
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  return getDirectionalEffectPadding(
    effect.blurX ?? 4,
    effect.blurY ?? 4,
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
  );
}

export function initializeInnerShadowEffect(
  out: EntityConstruction<InnerShadowEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<InnerShadowEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'InnerShadowEffect');
  out.alpha = options.alpha;
  out.angle = options.angle;
  out.blurX = options.blurX;
  out.blurY = options.blurY;
  out.color = options.color;
  out.distance = options.distance;
  out.quality = options.quality;
  out.sourceMode = options.sourceMode;
  out.strength = options.strength;
}

export function registerInnerShadowEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'InnerShadowEffect', resolveInnerShadowEffectPadding);
}

function resolveInnerShadowEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getInnerShadowEffectPadding(effect as Readonly<InnerShadowEffect>);
}
