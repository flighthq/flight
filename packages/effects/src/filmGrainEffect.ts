import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, FilmGrainEffect } from '@flighthq/types/contract';

export function createFilmGrainEffect(
  options: Readonly<Omit<EntityWithoutRuntime<FilmGrainEffect>, 'kind'>> = {},
): FilmGrainEffect {
  return createEntity({ kind: 'FilmGrainEffect', ...options });
}
