import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { VignetteEffect } from './types/VignetteEffect.ts';

export function createVignetteEffect(
  options: Readonly<Omit<EntityWithoutRuntime<VignetteEffect>, 'kind'>> = {},
): VignetteEffect {
  const out = allocateEntity<VignetteEffect>();
  initializeVignetteEffect(out, options);
  return out;
}

export function initializeVignetteEffect(
  out: EntityConstruction<VignetteEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<VignetteEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'VignetteEffect');
  out.intensity = options.intensity;
  out.radius = options.radius;
  out.softness = options.softness;
  out.color = options.color;
}
