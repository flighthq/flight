import type { FilmGrainEffect } from '@flighthq/types/contract';

export function createFilmGrainEffect(options: Readonly<Omit<FilmGrainEffect, 'kind'>> = {}): FilmGrainEffect {
  return { kind: 'FilmGrainEffect', ...options };
}
