import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  BokehDepthOfFieldEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createBokehDepthOfFieldEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BokehDepthOfFieldEffect>, 'kind'>> = {},
): BokehDepthOfFieldEffect {
  return createEntity({ kind: 'BokehDepthOfFieldEffect', ...options });
}

export function getBokehDepthOfFieldEffectPadding(effect: Readonly<BokehDepthOfFieldEffect>): RenderEffectPadding {
  const radius = Math.ceil(Math.max(0, effect.maxBlur ?? 4));
  return { bottom: radius, left: radius, right: radius, top: radius };
}

export function registerBokehDepthOfFieldEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'BokehDepthOfFieldEffect', resolveBokehDepthOfFieldEffectPadding);
}

function resolveBokehDepthOfFieldEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getBokehDepthOfFieldEffectPadding(effect as Readonly<BokehDepthOfFieldEffect>);
}
