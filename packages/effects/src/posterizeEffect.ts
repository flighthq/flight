import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, PosterizeEffect } from '@flighthq/types/contract';

export function createPosterizeEffect(
  options: Readonly<Omit<EntityWithoutRuntime<PosterizeEffect>, 'kind'>> = {},
): PosterizeEffect {
  return createEntity({ kind: 'PosterizeEffect', ...options });
}
