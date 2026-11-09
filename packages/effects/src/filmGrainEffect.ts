import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { FilmGrainEffect } from './types/FilmGrainEffect.ts';

export function createFilmGrainEffect(
  options: Readonly<Omit<EntityWithoutRuntime<FilmGrainEffect>, 'kind'>> = {},
): FilmGrainEffect {
  const out = allocateEntity<FilmGrainEffect>();
  initializeFilmGrainEffect(out, options);
  return out;
}

export function initializeFilmGrainEffect(
  out: EntityConstruction<FilmGrainEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<FilmGrainEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'FilmGrainEffect');
  out.intensity = options.intensity;
  out.size = options.size;
  out.seed = options.seed;
}
