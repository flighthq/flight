import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, PanniniProjectionEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createPanniniProjectionEffect(
  options: Readonly<Omit<EntityWithoutRuntime<PanniniProjectionEffect>, 'kind'>> = {},
): PanniniProjectionEffect {
  const out = allocateEntity<PanniniProjectionEffect>();
  initializePanniniProjectionEffect(out, options);
  return finishEntity(out);
}

export function initializePanniniProjectionEffect(
  out: EntityConstruction<PanniniProjectionEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<PanniniProjectionEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'PanniniProjectionEffect');
  out.compression = options.compression;
  out.crop = options.crop;
}
