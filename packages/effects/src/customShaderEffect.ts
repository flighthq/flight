import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CustomShaderEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';

export function createCustomShaderEffect(
  options: Readonly<Omit<EntityWithoutRuntime<CustomShaderEffect>, 'kind'>>,
): CustomShaderEffect {
  const out = allocateEntity<CustomShaderEffect>();
  initializeCustomShaderEffect(out, options);
  return finishEntity(out);
}

export function initializeCustomShaderEffect(
  out: EntityConstruction<CustomShaderEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<CustomShaderEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'CustomShaderEffect');
  out.shaderKey = options.shaderKey;
  out.uniforms = options.uniforms;
}
