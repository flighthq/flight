import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, LensFlareEffect } from '@flighthq/types/contract';

export function createLensFlareEffect(
  options: Readonly<Omit<EntityWithoutRuntime<LensFlareEffect>, 'kind'>> = {},
): LensFlareEffect {
  return createEntity({ kind: 'LensFlareEffect', ...options });
}
