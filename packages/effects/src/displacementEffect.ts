import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  DisplacementEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createDisplacementEffect(
  options: Readonly<Omit<EntityWithoutRuntime<DisplacementEffect>, 'kind'>> = {},
): DisplacementEffect {
  const out = allocateEntity<DisplacementEffect>();
  initializeDisplacementEffect(out, options);
  return finishEntity(out);
}

export function getDisplacementEffectPadding(effect: Readonly<DisplacementEffect>): RenderEffectPadding {
  const intensity = Math.abs(effect.intensity ?? 8);
  const horizontal = Math.ceil(intensity * 1.5);
  const vertical = Math.ceil(intensity);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function initializeDisplacementEffect(
  out: EntityConstruction<DisplacementEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<DisplacementEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'DisplacementEffect');
  out.intensity = options.intensity;
  out.frequency = options.frequency;
  out.seed = options.seed;
}

export function registerDisplacementEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'DisplacementEffect', resolveDisplacementEffectPadding);
}

function resolveDisplacementEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getDisplacementEffectPadding(effect as Readonly<DisplacementEffect>);
}
