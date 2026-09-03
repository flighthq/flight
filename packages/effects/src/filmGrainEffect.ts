import { createEntity } from '@flighthq/entity/contract';
import type { FilmGrainEffect } from '@flighthq/types/contract';

export function createFilmGrainEffect(options: Readonly<Omit<FilmGrainEffect, 'kind'>> = {}): FilmGrainEffect {
  return createEntity({ kind: 'FilmGrainEffect', ...options });
}
