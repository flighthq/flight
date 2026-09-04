import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CustomShaderEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

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
  initializeRenderEffect(out, 'CustomShaderEffect');
  out.shaderKey = options.shaderKey;
  out.uniforms = options.uniforms;
}
