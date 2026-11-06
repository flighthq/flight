import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';
import type { RenderState } from '@flighthq/render/contract';
import type { EffectPadding } from '@flighthq/render/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';
import type { Effect } from './types.ts';
import type { DisplacementEffect } from './types/DisplacementEffect.ts';

export function createDisplacementEffect(
  options: Readonly<Omit<EntityWithoutRuntime<DisplacementEffect>, 'kind'>> = {},
): DisplacementEffect {
  const out = allocateEntity<DisplacementEffect>();
  initializeDisplacementEffect(out, options);
  return finishEntity(out);
}

export function getDisplacementEffectPadding(effect: Readonly<DisplacementEffect>): EffectPadding {
  const intensity = Math.abs(effect.intensity ?? 8);
  const horizontal = Math.ceil(intensity * 1.5);
  const vertical = Math.ceil(intensity);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function initializeDisplacementEffect(
  out: EntityConstruction<DisplacementEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<DisplacementEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'DisplacementEffect');
  out.intensity = options.intensity;
  out.frequency = options.frequency;
  out.seed = options.seed;
}

export function registerDisplacementEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'DisplacementEffect', resolveDisplacementEffectPadding);
}

function resolveDisplacementEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getDisplacementEffectPadding(effect as Readonly<DisplacementEffect>);
}
