import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
  TiltShiftEffect,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createTiltShiftEffect(
  options: Readonly<Omit<EntityWithoutRuntime<TiltShiftEffect>, 'kind'>> = {},
): TiltShiftEffect {
  const out = allocateEntity<TiltShiftEffect>();
  initializeTiltShiftEffect(out, options);
  return finishEntity(out);
}

export function getTiltShiftEffectPadding(effect: Readonly<TiltShiftEffect>): RenderEffectPadding {
  const vertical = Math.ceil(Math.max(0, effect.blur ?? 4) * 3);
  return { bottom: vertical, left: 0, right: 0, top: vertical };
}

export function initializeTiltShiftEffect(
  out: EntityConstruction<TiltShiftEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<TiltShiftEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'TiltShiftEffect');
  out.center = options.center;
  out.width = options.width;
  out.blur = options.blur;
}

export function registerTiltShiftEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'TiltShiftEffect', resolveTiltShiftEffectPadding);
}

function resolveTiltShiftEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getTiltShiftEffectPadding(effect as Readonly<TiltShiftEffect>);
}
