import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  MedianEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createMedianEffect(
  options: Readonly<Omit<EntityWithoutRuntime<MedianEffect>, 'kind'>> = {},
): MedianEffect {
  const out = allocateEntity<MedianEffect>();
  initializeMedianEffect(out, options);
  return finishEntity(out);
}

export function getMedianEffectPadding(effect: Readonly<MedianEffect>): RenderEffectPadding {
  const radius = Math.max(0, Math.round(effect.radius ?? 1));
  return { bottom: radius, left: radius, right: radius, top: radius };
}

export function initializeMedianEffect(
  out: EntityConstruction<MedianEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<MedianEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'MedianEffect');
  out.radius = options.radius;
}

export function registerMedianEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'MedianEffect', resolveMedianEffectPadding);
}

function resolveMedianEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getMedianEffectPadding(effect as Readonly<MedianEffect>);
}
