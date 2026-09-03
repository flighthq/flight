import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  OutlineEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createOutlineEffect(
  options: Readonly<Omit<EntityWithoutRuntime<OutlineEffect>, 'kind'>> = {},
): OutlineEffect {
  return createEntity({ kind: 'OutlineEffect', ...options });
}

export function getOutlineEffectPadding(effect: Readonly<OutlineEffect>): RenderEffectPadding {
  const thickness = Math.ceil(Math.max(0, effect.thickness ?? 1));
  return { bottom: thickness, left: thickness, right: thickness, top: thickness };
}

export function registerOutlineEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'OutlineEffect', resolveOutlineEffectPadding);
}

function resolveOutlineEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getOutlineEffectPadding(effect as Readonly<OutlineEffect>);
}
