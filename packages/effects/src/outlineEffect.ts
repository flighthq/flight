import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  OutlineEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createOutlineEffect(
  options: Readonly<Omit<EntityWithoutRuntime<OutlineEffect>, 'kind'>> = {},
): OutlineEffect {
  const out = allocateEntity<OutlineEffect>();
  initializeOutlineEffect(out, options);
  return finishEntity(out);
}

export function getOutlineEffectPadding(effect: Readonly<OutlineEffect>): RenderEffectPadding {
  const thickness = Math.ceil(Math.max(0, effect.thickness ?? 1));
  return { bottom: thickness, left: thickness, right: thickness, top: thickness };
}

export function initializeOutlineEffect(
  out: EntityConstruction<OutlineEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<OutlineEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'OutlineEffect');
  out.threshold = options.threshold;
  out.thickness = options.thickness;
  out.color = options.color;
}

export function registerOutlineEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'OutlineEffect', resolveOutlineEffectPadding);
}

function resolveOutlineEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getOutlineEffectPadding(effect as Readonly<OutlineEffect>);
}
