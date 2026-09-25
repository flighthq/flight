import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, PosterizeEffect } from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';

export function createPosterizeEffect(
  options: Readonly<Omit<EntityWithoutRuntime<PosterizeEffect>, 'kind'>> = {},
): PosterizeEffect {
  const out = allocateEntity<PosterizeEffect>();
  initializePosterizeEffect(out, options);
  return finishEntity(out);
}

export function initializePosterizeEffect(
  out: EntityConstruction<PosterizeEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<PosterizeEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'PosterizeEffect');
  out.levels = options.levels;
}
