import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { AutoExposureEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createAutoExposureEffect(
  options: Readonly<Omit<EntityWithoutRuntime<AutoExposureEffect>, 'kind'>> = {},
): AutoExposureEffect {
  const out = allocateEntity<AutoExposureEffect>();
  initializeAutoExposureEffect(out, options);
  return finishEntity(out);
}

export function initializeAutoExposureEffect(
  out: EntityConstruction<AutoExposureEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<AutoExposureEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'AutoExposureEffect');
  out.adaptationSpeed = options.adaptationSpeed;
  out.exposureCompensation = options.exposureCompensation;
  out.maxExposure = options.maxExposure;
  out.minExposure = options.minExposure;
}
