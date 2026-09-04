import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, FilmGrainEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createFilmGrainEffect(
  options: Readonly<Omit<EntityWithoutRuntime<FilmGrainEffect>, 'kind'>> = {},
): FilmGrainEffect {
  const out = allocateEntity<FilmGrainEffect>();
  initializeFilmGrainEffect(out, options);
  return finishEntity(out);
}

export function initializeFilmGrainEffect(
  out: EntityConstruction<FilmGrainEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<FilmGrainEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'FilmGrainEffect');
  out.intensity = options.intensity;
  out.size = options.size;
  out.seed = options.seed;
}
