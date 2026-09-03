import { createEntity } from '@flighthq/entity/contract';
import type { CustomShaderEffect } from '@flighthq/types/contract';

export function createCustomShaderEffect(options: Readonly<Omit<CustomShaderEffect, 'kind'>>): CustomShaderEffect {
  return createEntity({ kind: 'CustomShaderEffect', ...options });
}
