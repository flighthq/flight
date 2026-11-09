import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';
import type { RenderState } from '@flighthq/render/contract';
import type { EffectPadding } from '@flighthq/render/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';
import type { Effect } from './types.ts';
import type { MedianEffect } from './types/MedianEffect.ts';

export function createMedianEffect(
  options: Readonly<Omit<EntityWithoutRuntime<MedianEffect>, 'kind'>> = {},
): MedianEffect {
  const out = allocateEntity<MedianEffect>();
  initializeMedianEffect(out, options);
  return out;
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
