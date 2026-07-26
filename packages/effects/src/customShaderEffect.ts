import type { CustomShaderEffect } from '@flighthq/types/contract';

export function createCustomShaderEffect(options: Readonly<Omit<CustomShaderEffect, 'kind'>>): CustomShaderEffect {
  return { kind: 'CustomShaderEffect', ...options };
}
