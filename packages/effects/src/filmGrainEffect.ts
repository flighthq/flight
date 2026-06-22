import type { FilmGrainEffect } from '@flighthq/types';

export function createFilmGrainEffect(options: Readonly<Omit<FilmGrainEffect, 'kind'>> = {}): FilmGrainEffect {
  return { kind: 'FilmGrainEffect', ...options };
}
