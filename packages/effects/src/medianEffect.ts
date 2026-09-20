import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  MedianEffect,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect';
import { registerEffectPaddingResolver } from './effectPadding';

export function createMedianEffect(
  options: Readonly<Omit<EntityWithoutRuntime<MedianEffect>, 'kind'>> = {},
): MedianEffect {
  const out = allocateEntity<MedianEffect>();
  initializeMedianEffect(out, options);
  return finishEntity(out);
}

export function getMedianEffectPadding(effect: Readonly<MedianEffect>): EffectPadding {
  const radius = Math.max(0, Math.round(effect.radius ?? 1));
  return { bottom: radius, left: radius, right: radius, top: radius };
}

export function initializeMedianEffect(
  out: EntityConstruction<MedianEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<MedianEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'MedianEffect');
  out.radius = options.radius;
}

export function registerMedianEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'MedianEffect', resolveMedianEffectPadding);
}

function resolveMedianEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getMedianEffectPadding(effect as Readonly<MedianEffect>);
}
