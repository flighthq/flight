import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { CustomShaderEffect } from './types/CustomShaderEffect.ts';

export function createCustomShaderEffect(
  options: Readonly<Omit<EntityWithoutRuntime<CustomShaderEffect>, 'kind'>>,
): CustomShaderEffect {
  const out = allocateEntity<CustomShaderEffect>();
  initializeCustomShaderEffect(out, options);
  return out;
}

export function initializeCustomShaderEffect(
  out: EntityConstruction<CustomShaderEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<CustomShaderEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'CustomShaderEffect');
  out.shaderKey = options.shaderKey;
  out.uniforms = options.uniforms;
}
