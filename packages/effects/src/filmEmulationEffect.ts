import type { FilmEmulationEffect } from '@flighthq/types';

export function createFilmEmulationEffect(
  options: Readonly<Omit<FilmEmulationEffect, 'kind'>> = {},
): FilmEmulationEffect {
  return { kind: 'FilmEmulationEffect', ...options };
}
