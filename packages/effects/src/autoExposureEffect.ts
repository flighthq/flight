import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { AutoExposureEffect } from './types/AutoExposureEffect.ts';

export function createAutoExposureEffect(
  options: Readonly<Omit<EntityWithoutRuntime<AutoExposureEffect>, 'kind'>> = {},
): AutoExposureEffect {
  const out = allocateEntity<AutoExposureEffect>();
  initializeAutoExposureEffect(out, options);
  return out;
}

export function initializeAutoExposureEffect(
  out: EntityConstruction<AutoExposureEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<AutoExposureEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'AutoExposureEffect');
  out.adaptationSpeed = options.adaptationSpeed;
  out.exposureCompensation = options.exposureCompensation;
  out.maxExposure = options.maxExposure;
  out.minExposure = options.minExposure;
}
