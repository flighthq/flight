import type { FilmEmulationEffect } from '@flighthq/types/contract';

export function createFilmEmulationEffect(
  options: Readonly<Omit<FilmEmulationEffect, 'kind'>> = {},
): FilmEmulationEffect {
  return { kind: 'FilmEmulationEffect', ...options };
}
