import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { SsaoEffect } from './types/SsaoEffect.ts';

export function createSsaoEffect(options: Readonly<Omit<EntityWithoutRuntime<SsaoEffect>, 'kind'>> = {}): SsaoEffect {
  const out = allocateEntity<SsaoEffect>();
  initializeSsaoEffect(out, options);
  return out;
}

export function initializeSsaoEffect(
  out: EntityConstruction<SsaoEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<SsaoEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'SsaoEffect');
  out.radius = options.radius;
  out.intensity = options.intensity;
  out.bias = options.bias;
  out.samples = options.samples;
}
