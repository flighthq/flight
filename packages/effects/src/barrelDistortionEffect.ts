import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { BarrelDistortionEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createBarrelDistortionEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BarrelDistortionEffect>, 'kind'>> = {},
): BarrelDistortionEffect {
  const out = allocateEntity<BarrelDistortionEffect>();
  initializeBarrelDistortionEffect(out, options);
  return finishEntity(out);
}

export function initializeBarrelDistortionEffect(
  out: EntityConstruction<BarrelDistortionEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<BarrelDistortionEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'BarrelDistortionEffect');
  out.amount = options.amount;
  out.scale = options.scale;
}
