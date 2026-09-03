import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, ScreenSpaceFogEffect } from '@flighthq/types/contract';

export function createScreenSpaceFogEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ScreenSpaceFogEffect>, 'kind'>> = {},
): ScreenSpaceFogEffect {
  return createEntity({ kind: 'ScreenSpaceFogEffect', ...options });
}
