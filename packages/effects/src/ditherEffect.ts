import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, DitherEffect } from '@flighthq/types/contract';

export function createDitherEffect(
  options: Readonly<Omit<EntityWithoutRuntime<DitherEffect>, 'kind'>> = {},
): DitherEffect {
  return createEntity({ kind: 'DitherEffect', ...options });
}
