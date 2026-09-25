import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  BokehDepthOfFieldEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';

export function createBokehDepthOfFieldEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BokehDepthOfFieldEffect>, 'kind'>> = {},
): BokehDepthOfFieldEffect {
  const out = allocateEntity<BokehDepthOfFieldEffect>();
  initializeBokehDepthOfFieldEffect(out, options);
  return finishEntity(out);
}

export function getBokehDepthOfFieldEffectPadding(effect: Readonly<BokehDepthOfFieldEffect>): EffectPadding {
  const radius = Math.ceil(Math.max(0, effect.maxBlur ?? 4));
  return { bottom: radius, left: radius, right: radius, top: radius };
}

export function initializeBokehDepthOfFieldEffect(
  out: EntityConstruction<BokehDepthOfFieldEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<BokehDepthOfFieldEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'BokehDepthOfFieldEffect');
  out.focusDistance = options.focusDistance;
  out.focusRange = options.focusRange;
  out.maxBlur = options.maxBlur;
}

export function registerBokehDepthOfFieldEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'BokehDepthOfFieldEffect', resolveBokehDepthOfFieldEffectPadding);
}

function resolveBokehDepthOfFieldEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getBokehDepthOfFieldEffectPadding(effect as Readonly<BokehDepthOfFieldEffect>);
}
