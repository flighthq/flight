import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, SsaoEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createSsaoEffect(options: Readonly<Omit<EntityWithoutRuntime<SsaoEffect>, 'kind'>> = {}): SsaoEffect {
  const out = allocateEntity<SsaoEffect>();
  initializeSsaoEffect(out, options);
  return finishEntity(out);
}

export function initializeSsaoEffect(
  out: EntityConstruction<SsaoEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<SsaoEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'SsaoEffect');
  out.radius = options.radius;
  out.intensity = options.intensity;
  out.bias = options.bias;
  out.samples = options.samples;
}
