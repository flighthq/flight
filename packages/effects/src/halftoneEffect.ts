import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, HalftoneEffect } from '@flighthq/types/contract';

export function createHalftoneEffect(
  options: Readonly<Omit<EntityWithoutRuntime<HalftoneEffect>, 'kind'>> = {},
): HalftoneEffect {
  return createEntity({ kind: 'HalftoneEffect', ...options });
}
