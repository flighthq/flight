import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, ToneMapEffect } from '@flighthq/types/contract';

export function createToneMapEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ToneMapEffect>, 'kind'>> = {},
): ToneMapEffect {
  return createEntity({ kind: 'ToneMapEffect', ...options });
}
