import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, GodRaysEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createGodRaysEffect(
  options: Readonly<Omit<EntityWithoutRuntime<GodRaysEffect>, 'kind'>> = {},
): GodRaysEffect {
  const out = allocateEntity<GodRaysEffect>();
  initializeGodRaysEffect(out, options);
  return finishEntity(out);
}

export function initializeGodRaysEffect(
  out: EntityConstruction<GodRaysEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<GodRaysEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'GodRaysEffect');
  out.centerX = options.centerX;
  out.centerY = options.centerY;
  out.density = options.density;
  out.decay = options.decay;
  out.weight = options.weight;
  out.exposure = options.exposure;
  out.samples = options.samples;
}
