import type { PosterizeEffect } from '@flighthq/types/contract';

export function createPosterizeEffect(options: Readonly<Omit<PosterizeEffect, 'kind'>> = {}): PosterizeEffect {
  return { kind: 'PosterizeEffect', ...options };
}
