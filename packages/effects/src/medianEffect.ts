import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  MedianEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createMedianEffect(
  options: Readonly<Omit<EntityWithoutRuntime<MedianEffect>, 'kind'>> = {},
): MedianEffect {
  return createEntity({ kind: 'MedianEffect', ...options });
}

export function getMedianEffectPadding(effect: Readonly<MedianEffect>): RenderEffectPadding {
  const radius = Math.max(0, Math.round(effect.radius ?? 1));
  return { bottom: radius, left: radius, right: radius, top: radius };
}

export function registerMedianEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'MedianEffect', resolveMedianEffectPadding);
}

function resolveMedianEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getMedianEffectPadding(effect as Readonly<MedianEffect>);
}
