import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, FilmEmulationEffect } from '@flighthq/types/contract';

export function createFilmEmulationEffect(
  options: Readonly<Omit<EntityWithoutRuntime<FilmEmulationEffect>, 'kind'>> = {},
): FilmEmulationEffect {
  return createEntity({ kind: 'FilmEmulationEffect', ...options });
}
