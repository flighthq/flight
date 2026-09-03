import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  DisplacementEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createDisplacementEffect(
  options: Readonly<Omit<EntityWithoutRuntime<DisplacementEffect>, 'kind'>> = {},
): DisplacementEffect {
  return createEntity({ kind: 'DisplacementEffect', ...options });
}

export function getDisplacementEffectPadding(effect: Readonly<DisplacementEffect>): RenderEffectPadding {
  const intensity = Math.abs(effect.intensity ?? 8);
  const horizontal = Math.ceil(intensity * 1.5);
  const vertical = Math.ceil(intensity);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function registerDisplacementEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'DisplacementEffect', resolveDisplacementEffectPadding);
}

function resolveDisplacementEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getDisplacementEffectPadding(effect as Readonly<DisplacementEffect>);
}
