import type { PosterizeEffect } from '@flighthq/types';

export function createPosterizeEffect(options: Readonly<Omit<PosterizeEffect, 'kind'>> = {}): PosterizeEffect {
  return { kind: 'PosterizeEffect', ...options };
}
