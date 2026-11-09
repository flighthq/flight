import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { SsrEffect } from './types/SsrEffect.ts';

export function createSsrEffect(options: Readonly<Omit<EntityWithoutRuntime<SsrEffect>, 'kind'>> = {}): SsrEffect {
  const out = allocateEntity<SsrEffect>();
  initializeSsrEffect(out, options);
  return out;
}

export function initializeSsrEffect(
  out: EntityConstruction<SsrEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<SsrEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'SsrEffect');
  out.maxDistance = options.maxDistance;
  out.resolution = options.resolution;
  out.steps = options.steps;
}
