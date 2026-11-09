import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { GodRaysEffect } from './types/GodRaysEffect.ts';

export function createGodRaysEffect(
  options: Readonly<Omit<EntityWithoutRuntime<GodRaysEffect>, 'kind'>> = {},
): GodRaysEffect {
  const out = allocateEntity<GodRaysEffect>();
  initializeGodRaysEffect(out, options);
  return out;
}

export function initializeGodRaysEffect(
  out: EntityConstruction<GodRaysEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<GodRaysEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'GodRaysEffect');
  out.centerX = options.centerX;
  out.centerY = options.centerY;
  out.density = options.density;
  out.decay = options.decay;
  out.weight = options.weight;
  out.exposure = options.exposure;
  out.samples = options.samples;
}
