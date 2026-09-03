import { createEntity } from '@flighthq/entity/contract';
import type { FilmEmulationEffect } from '@flighthq/types/contract';

export function createFilmEmulationEffect(
  options: Readonly<Omit<FilmEmulationEffect, 'kind'>> = {},
): FilmEmulationEffect {
  return createEntity({ kind: 'FilmEmulationEffect', ...options });
}
