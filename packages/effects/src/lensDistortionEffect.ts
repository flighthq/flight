import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { LensDistortionEffect } from './types/LensDistortionEffect.ts';

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
  initializeEffect(out, 'LensDistortionEffect');
  out.amount = options.amount;
  out.scale = options.scale;
}
