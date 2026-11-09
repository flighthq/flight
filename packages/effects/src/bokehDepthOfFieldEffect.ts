import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';
import type { RenderState } from '@flighthq/render/contract';
import type { EffectPadding } from '@flighthq/render/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';
import type { Effect } from './types.ts';
import type { BokehDepthOfFieldEffect } from './types/BokehDepthOfFieldEffect.ts';

export function createBokehDepthOfFieldEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BokehDepthOfFieldEffect>, 'kind'>> = {},
): BokehDepthOfFieldEffect {
  const out = allocateEntity<BokehDepthOfFieldEffect>();
  initializeBokehDepthOfFieldEffect(out, options);
  return out;
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
