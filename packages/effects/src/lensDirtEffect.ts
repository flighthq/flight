import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, LensDirtEffect } from '@flighthq/types/contract';

export function createLensDirtEffect(
  options: Readonly<Omit<EntityWithoutRuntime<LensDirtEffect>, 'kind'>> = {},
): LensDirtEffect {
  return createEntity({ kind: 'LensDirtEffect', ...options });
}
