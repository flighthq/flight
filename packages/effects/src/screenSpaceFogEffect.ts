import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, ScreenSpaceFogEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createScreenSpaceFogEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ScreenSpaceFogEffect>, 'kind'>> = {},
): ScreenSpaceFogEffect {
  const out = allocateEntity<ScreenSpaceFogEffect>();
  initializeScreenSpaceFogEffect(out, options);
  return finishEntity(out);
}

export function initializeScreenSpaceFogEffect(
  out: EntityConstruction<ScreenSpaceFogEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<ScreenSpaceFogEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'ScreenSpaceFogEffect');
  out.color = options.color;
  out.near = options.near;
  out.far = options.far;
  out.density = options.density;
}
