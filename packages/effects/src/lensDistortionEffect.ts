import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, LensDistortionEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createLensDistortionEffect(
  options: Readonly<Omit<EntityWithoutRuntime<LensDistortionEffect>, 'kind'>> = {},
): LensDistortionEffect {
  const out = allocateEntity<LensDistortionEffect>();
  initializeLensDistortionEffect(out, options);
  return finishEntity(out);
}

export function initializeLensDistortionEffect(
  out: EntityConstruction<LensDistortionEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<LensDistortionEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'LensDistortionEffect');
  out.amount = options.amount;
  out.scale = options.scale;
}
