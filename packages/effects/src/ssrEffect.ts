import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, SsrEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createSsrEffect(options: Readonly<Omit<EntityWithoutRuntime<SsrEffect>, 'kind'>> = {}): SsrEffect {
  const out = allocateEntity<SsrEffect>();
  initializeSsrEffect(out, options);
  return finishEntity(out);
}

export function initializeSsrEffect(
  out: EntityConstruction<SsrEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<SsrEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'SsrEffect');
  out.maxDistance = options.maxDistance;
  out.resolution = options.resolution;
  out.steps = options.steps;
}
