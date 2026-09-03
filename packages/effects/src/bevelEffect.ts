import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  BevelEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { getDirectionalRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Bevel composite effect: the directional gradient of the blurred silhouette drives a highlight/shadow edge band, clipped by bevelType, then applies sourceMode compositing.
export function createBevelEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BevelEffect>, 'kind'>> = {},
): BevelEffect {
  return createEntity({ kind: 'BevelEffect', ...options });
}

export function getBevelEffectPadding(effect: Readonly<BevelEffect>): RenderEffectPadding {
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  return getDirectionalRenderEffectPadding(
    effect.blurX ?? 4,
    effect.blurY ?? 4,
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
  );
}

export function registerBevelEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'BevelEffect', resolveBevelEffectPadding);
}

function resolveBevelEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getBevelEffectPadding(effect as Readonly<BevelEffect>);
}
