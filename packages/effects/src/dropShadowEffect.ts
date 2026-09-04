import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  DropShadowEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { getDirectionalRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then apply sourceMode compositing.
export function createDropShadowEffect(
  options: Readonly<Omit<EntityWithoutRuntime<DropShadowEffect>, 'kind'>> = {},
): DropShadowEffect {
  const out = allocateEntity<DropShadowEffect>();
  initializeDropShadowEffect(out, options);
  return finishEntity(out);
}

export function getDropShadowEffectPadding(effect: Readonly<DropShadowEffect>): RenderEffectPadding {
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  return getDirectionalRenderEffectPadding(
    effect.blurX ?? 4,
    effect.blurY ?? 4,
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
  );
}

export function initializeDropShadowEffect(
  out: EntityConstruction<DropShadowEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<DropShadowEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'DropShadowEffect');
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

export function registerDropShadowEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'DropShadowEffect', resolveDropShadowEffectPadding);
}

function resolveDropShadowEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getDropShadowEffectPadding(effect as Readonly<DropShadowEffect>);
}
