import { createEntity } from '@flighthq/entity/contract';
import type { PosterizeEffect } from '@flighthq/types/contract';

export function createPosterizeEffect(options: Readonly<Omit<PosterizeEffect, 'kind'>> = {}): PosterizeEffect {
  return createEntity({ kind: 'PosterizeEffect', ...options });
}
