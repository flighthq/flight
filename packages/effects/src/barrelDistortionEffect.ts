import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { BarrelDistortionEffect } from './types/BarrelDistortionEffect.ts';

export function createBarrelDistortionEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BarrelDistortionEffect>, 'kind'>> = {},
): BarrelDistortionEffect {
  const out = allocateEntity<BarrelDistortionEffect>();
  initializeBarrelDistortionEffect(out, options);
  return out;
}

export function initializeBarrelDistortionEffect(
  out: EntityConstruction<BarrelDistortionEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<BarrelDistortionEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'BarrelDistortionEffect');
  out.amount = options.amount;
  out.scale = options.scale;
}
