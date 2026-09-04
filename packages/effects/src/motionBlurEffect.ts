import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, MotionBlurEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createMotionBlurEffect(
  options: Readonly<Omit<EntityWithoutRuntime<MotionBlurEffect>, 'kind'>> = {},
): MotionBlurEffect {
  const out = allocateEntity<MotionBlurEffect>();
  initializeMotionBlurEffect(out, options);
  return finishEntity(out);
}

export function initializeMotionBlurEffect(
  out: EntityConstruction<MotionBlurEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<MotionBlurEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'MotionBlurEffect');
  out.intensity = options.intensity;
  out.samples = options.samples;
}
