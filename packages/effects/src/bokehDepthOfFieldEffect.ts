import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  BokehDepthOfFieldEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createBokehDepthOfFieldEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BokehDepthOfFieldEffect>, 'kind'>> = {},
): BokehDepthOfFieldEffect {
  const out = allocateEntity<BokehDepthOfFieldEffect>();
  initializeBokehDepthOfFieldEffect(out, options);
  return finishEntity(out);
}

export function getBokehDepthOfFieldEffectPadding(effect: Readonly<BokehDepthOfFieldEffect>): RenderEffectPadding {
  const radius = Math.ceil(Math.max(0, effect.maxBlur ?? 4));
  return { bottom: radius, left: radius, right: radius, top: radius };
}

export function initializeBokehDepthOfFieldEffect(
  out: EntityConstruction<BokehDepthOfFieldEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<BokehDepthOfFieldEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'BokehDepthOfFieldEffect');
  out.focusDistance = options.focusDistance;
  out.focusRange = options.focusRange;
  out.maxBlur = options.maxBlur;
}

export function registerBokehDepthOfFieldEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'BokehDepthOfFieldEffect', resolveBokehDepthOfFieldEffectPadding);
}

function resolveBokehDepthOfFieldEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getBokehDepthOfFieldEffectPadding(effect as Readonly<BokehDepthOfFieldEffect>);
}
