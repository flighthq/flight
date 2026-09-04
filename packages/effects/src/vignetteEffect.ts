import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, VignetteEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createVignetteEffect(
  options: Readonly<Omit<EntityWithoutRuntime<VignetteEffect>, 'kind'>> = {},
): VignetteEffect {
  const out = allocateEntity<VignetteEffect>();
  initializeVignetteEffect(out, options);
  return finishEntity(out);
}

export function initializeVignetteEffect(
  out: EntityConstruction<VignetteEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<VignetteEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'VignetteEffect');
  out.intensity = options.intensity;
  out.radius = options.radius;
  out.softness = options.softness;
  out.color = options.color;
}
