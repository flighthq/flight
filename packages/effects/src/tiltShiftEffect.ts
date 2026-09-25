import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  Effect,
  EffectPadding,
  RenderState,
  TiltShiftEffect,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';

export function createTiltShiftEffect(
  options: Readonly<Omit<EntityWithoutRuntime<TiltShiftEffect>, 'kind'>> = {},
): TiltShiftEffect {
  const out = allocateEntity<TiltShiftEffect>();
  initializeTiltShiftEffect(out, options);
  return finishEntity(out);
}

export function getTiltShiftEffectPadding(effect: Readonly<TiltShiftEffect>): EffectPadding {
  const vertical = Math.ceil(Math.max(0, effect.blur ?? 4) * 3);
  return { bottom: vertical, left: 0, right: 0, top: vertical };
}

export function initializeTiltShiftEffect(
  out: EntityConstruction<TiltShiftEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<TiltShiftEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'TiltShiftEffect');
  out.center = options.center;
  out.width = options.width;
  out.blur = options.blur;
}

export function registerTiltShiftEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'TiltShiftEffect', resolveTiltShiftEffectPadding);
}

function resolveTiltShiftEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getTiltShiftEffectPadding(effect as Readonly<TiltShiftEffect>);
}
