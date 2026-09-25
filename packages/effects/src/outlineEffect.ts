import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  OutlineEffect,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';

export function createOutlineEffect(
  options: Readonly<Omit<EntityWithoutRuntime<OutlineEffect>, 'kind'>> = {},
): OutlineEffect {
  const out = allocateEntity<OutlineEffect>();
  initializeOutlineEffect(out, options);
  return finishEntity(out);
}

export function getOutlineEffectPadding(effect: Readonly<OutlineEffect>): EffectPadding {
  const thickness = Math.ceil(Math.max(0, effect.thickness ?? 1));
  return { bottom: thickness, left: thickness, right: thickness, top: thickness };
}

export function initializeOutlineEffect(
  out: EntityConstruction<OutlineEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<OutlineEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'OutlineEffect');
  out.threshold = options.threshold;
  out.thickness = options.thickness;
  out.color = options.color;
}

export function registerOutlineEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'OutlineEffect', resolveOutlineEffectPadding);
}

function resolveOutlineEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getOutlineEffectPadding(effect as Readonly<OutlineEffect>);
}
