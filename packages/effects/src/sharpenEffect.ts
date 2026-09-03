import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, SharpenEffect } from '@flighthq/types/contract';

export function createSharpenEffect(
  options: Readonly<Omit<EntityWithoutRuntime<SharpenEffect>, 'kind'>> = {},
): SharpenEffect {
  return createEntity({ kind: 'SharpenEffect', ...options });
}
