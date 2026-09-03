import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, CustomShaderEffect } from '@flighthq/types/contract';

export function createCustomShaderEffect(
  options: Readonly<Omit<EntityWithoutRuntime<CustomShaderEffect>, 'kind'>>,
): CustomShaderEffect {
  return createEntity({ kind: 'CustomShaderEffect', ...options });
}
