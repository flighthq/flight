import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  InnerShadowEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { getDirectionalRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then draw or hide the source.
export function createInnerShadowEffect(
  options: Readonly<Omit<EntityWithoutRuntime<InnerShadowEffect>, 'kind'>> = {},
): InnerShadowEffect {
  const out = allocateEntity<InnerShadowEffect>();
  initializeInnerShadowEffect(out, options);
  return finishEntity(out);
}

export function getInnerShadowEffectPadding(effect: Readonly<InnerShadowEffect>): RenderEffectPadding {
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  return getDirectionalRenderEffectPadding(
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
  initializeRenderEffect(out, 'InnerShadowEffect');
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
  registerRenderEffectPaddingResolver(state, 'InnerShadowEffect', resolveInnerShadowEffectPadding);
}

function resolveInnerShadowEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getInnerShadowEffectPadding(effect as Readonly<InnerShadowEffect>);
}
