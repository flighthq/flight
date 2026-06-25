import type { CustomShaderEffect } from '@flighthq/types';

export function createCustomShaderEffect(options: Readonly<Omit<CustomShaderEffect, 'kind'>>): CustomShaderEffect {
  return { kind: 'CustomShaderEffect', ...options };
}
